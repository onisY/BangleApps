/*
 * sensY - accelerometer/barometer research logger and sweep graph
 * Bangle.js 2
 */
(function () {
  var Storage = require("Storage");
  var VERSION = "0.013";
  var SETTINGS_FILE = "sensY.json";
  var APP_ID = "sensY";

  var ACC_HZ = [1, 2, 5, 10, 12.5, 25, 50, 100];
  var PRESS_HZ = [0.2, 0.5, 1];

  var DEFAULTS = {
    span: 10,
    accInteg: 0,
    accYmin: -2,
    accYmax: 2,
    ax: { hz: 12.5, rec: false, graph: true },
    ay: { hz: 12.5, rec: false, graph: true },
    az: { hz: 12.5, rec: false, graph: true },
    p:  { hz: 1,    rec: false, graph: true, integ: 0, ymin: 950, ymax: 1050 }
  };

  /*
   * Bangle.js 2 has a limited display palette. Choose four traces that
   * keep strong luminance/chroma contrast against the active theme.
   */
  var COLORS = g.theme.dark ? {
    ax: "#fff",
    ay: "#ff0",
    az: "#0ff",
    p:  "#f0f"
  } : {
    ax: "#000",
    ay: "#f00",
    az: "#00f",
    p:  "#f0f"
  };

  /*
   * Gravity estimate from the 3-axis accelerometer. The low-pass vector
   * follows orientation, then is normalised to 1 g before subtraction.
   */
  var GRAVITY_TAU = 0.8;
  var gravity = { init: false, x: 0, y: 0, z: 0, t: 0 };

  /*
   * When displaying integrated acceleration, suppress settled integration
   * drift. Every 3 s compare the three integrated outputs with their
   * values at the start of the window. If all relative changes are <=5%,
   * reset the acceleration integrators together.
   */
  var STABLE_WINDOW_S = 3;
  var STABLE_REL = 0.05;
  var STABLE_EPS = 1e-6;
  var accelStable = { t: undefined, ax: 0, ay: 0, az: 0 };

  var cfg;
  var states = {};
  var lastPlot = {};
  var measuring = false;
  var sweepStart = 0;
  var lastSweepX = -1;
  var W = g.getWidth();
  var H = g.getHeight();

  var sessionStartT = getTime();
  var logFile;
  var logName;
  var logBuf = "";
  var flushTimer;

  var oldPowerSave = true;
  try {
    var oldOpts = Bangle.getOptions();
    if (oldOpts && oldOpts.powerSave !== undefined) oldPowerSave = oldOpts.powerSave;
  } catch (e) {}

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function loadSettings() {
    var s = Storage.readJSON(SETTINGS_FILE, 1) || {};
    var d = clone(DEFAULTS);
    if (typeof s.span === "number") d.span = s.span;
    if (typeof s.accInteg === "number") d.accInteg = s.accInteg;
    else if (s.ax && typeof s.ax.integ === "number") d.accInteg = s.ax.integ;

    if (typeof s.accYmin === "number") d.accYmin = s.accYmin;
    else if (s.ax && typeof s.ax.ymin === "number") d.accYmin = s.ax.ymin;
    if (typeof s.accYmax === "number") d.accYmax = s.accYmax;
    else if (s.ax && typeof s.ax.ymax === "number") d.accYmax = s.ax.ymax;

    ["ax", "ay", "az", "p"].forEach(function (k) {
      if (!s[k]) return;
      Object.keys(d[k]).forEach(function (q) {
        if (s[k][q] !== undefined) d[k][q] = s[k][q];
      });
    });
    d.span = Math.max(1, Math.min(300, d.span));
    d.accInteg = Math.max(0, Math.min(2, d.accInteg | 0));
    if (!(d.accYmax > d.accYmin)) d.accYmax = d.accYmin + 0.1;
    return d;
  }

  function saveSettings() {
    Storage.writeJSON(SETTINGS_FILE, cfg);
  }

  function pad2(n) {
    return ("0" + n).slice(-2);
  }

  function makeLogName() {
    var d = new Date();
    var stem = "sensY" +
      pad2(d.getFullYear() % 100) +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) +
      pad2(d.getHours()) +
      pad2(d.getMinutes()) +
      pad2(d.getSeconds());
    var fn = stem + ".csv";
    var n = 0;
    while (Storage.list(fn).length && n < 26) {
      fn = stem + String.fromCharCode(97 + n) + ".csv";
      n++;
    }
    return fn;
  }

  function ensureLog() {
    if (logFile) return;
    logName = makeLogName();
    logFile = Storage.open(logName, "w");
    logFile.write("t_s,ax_lin_g,ay_lin_g,az_lin_g,p_hPa\n");
  }

  function flushLog() {
    if (logFile && logBuf) {
      logFile.write(logBuf);
      logBuf = "";
    }
  }

  function appendLog(t, vals) {
    ensureLog();
    var row = [(t - sessionStartT).toFixed(3)];
    ["ax", "ay", "az", "p"].forEach(function (k) {
      var v = vals[k];
      if (v === undefined || v === null) row.push("");
      else if (k === "p") row.push(v.toFixed(3));
      else row.push(v.toFixed(6));
    });
    logBuf += row.join(",") + "\n";
    if (logBuf.length >= 768) flushLog();
  }

  function newState() {
    return {
      nextT: undefined,
      lastT: undefined,
      prevRaw: 0,
      i1: 0,
      i2: 0,
      value: 0,
      raw: 0,
      has: false
    };
  }

  function resetStates() {
    states = {
      ax: newState(),
      ay: newState(),
      az: newState(),
      p: newState()
    };
    gravity = { init: false, x: 0, y: 0, z: 0, t: 0 };
    accelStable = { t: undefined, ax: 0, ay: 0, az: 0 };
    lastPlot = { ax: null, ay: null, az: null, p: null };
  }

  function removeGravity(a, t) {
    if (!gravity.init) {
      gravity.x = a.x;
      gravity.y = a.y;
      gravity.z = a.z;
      gravity.t = t;
      gravity.init = true;
    } else {
      var dt = t - gravity.t;
      if (dt < 0) dt = 0;
      if (dt > 0.25) dt = 0.25;
      var alpha = dt / (GRAVITY_TAU + dt);
      gravity.x += alpha * (a.x - gravity.x);
      gravity.y += alpha * (a.y - gravity.y);
      gravity.z += alpha * (a.z - gravity.z);
      gravity.t = t;
    }

    var m = Math.sqrt(
      gravity.x * gravity.x +
      gravity.y * gravity.y +
      gravity.z * gravity.z
    );
    if (m < 0.05) return { x: a.x, y: a.y, z: a.z };

    return {
      x: a.x - gravity.x / m,
      y: a.y - gravity.y / m,
      z: a.z - gravity.z / m
    };
  }

  function integrationOrder(k) {
    return k === "p" ? (cfg.p.integ | 0) : (cfg.accInteg | 0);
  }

  function accelGraphActive() {
    return !!(cfg.ax.graph || cfg.ay.graph || cfg.az.graph);
  }

  function setAccelStableReference(t) {
    accelStable.t = t;
    accelStable.ax = states.ax.value;
    accelStable.ay = states.ay.value;
    accelStable.az = states.az.value;
  }

  function relativeChange(a, b) {
    var d = Math.max(Math.abs(a), Math.abs(b), STABLE_EPS);
    return Math.abs(b - a) / d;
  }

  function zeroAccelIntegrals(t) {
    ["ax", "ay", "az"].forEach(function (k) {
      var st = states[k];
      st.i1 = 0;
      st.i2 = 0;
      st.value = 0;
      st.lastT = t;
      st.prevRaw = st.raw;
      if (cfg[k].graph && Bangle.isLCDOn()) plotSample(k, 0, t);
    });
    setAccelStableReference(t);
  }

  function checkAccelStableReset(t) {
    if (cfg.accInteg < 1 || !accelGraphActive()) {
      accelStable.t = undefined;
      return;
    }
    if (!states.ax.has || !states.ay.has || !states.az.has) return;

    if (accelStable.t === undefined) {
      setAccelStableReference(t);
      return;
    }
    if (t - accelStable.t < STABLE_WINDOW_S) return;

    var stable =
      relativeChange(accelStable.ax, states.ax.value) <= STABLE_REL &&
      relativeChange(accelStable.ay, states.ay.value) <= STABLE_REL &&
      relativeChange(accelStable.az, states.az.value) <= STABLE_REL;

    if (stable) zeroAccelIntegrals(t);
    else setAccelStableReference(t);
  }

  function due(st, hz, t) {
    if (st.nextT === undefined) {
      st.nextT = t + 1 / hz;
      return true;
    }
    if (t + 0.0005 < st.nextT) return false;
    var period = 1 / hz;
    do {
      st.nextT += period;
    } while (st.nextT <= t);
    return true;
  }

  function processValue(k, raw, t) {
    var c = cfg[k];
    var st = states[k];
    if (!due(st, c.hz, t)) return false;

    if (!st.has) {
      st.lastT = t;
      st.prevRaw = raw;
      st.i1 = 0;
      st.i2 = 0;
      st.has = true;
    } else {
      var dt = t - st.lastT;
      if (dt < 0) dt = 0;
      var oldI1 = st.i1;
      st.i1 += 0.5 * (st.prevRaw + raw) * dt;
      st.i2 += 0.5 * (oldI1 + st.i1) * dt;
      st.prevRaw = raw;
      st.lastT = t;
    }

    st.raw = raw;
    var integ = integrationOrder(k);
    st.value = integ === 1 ? st.i1 : (integ === 2 ? st.i2 : raw);
    plotSample(k, st.value, t);
    return true;
  }

  function graphX(t) {
    var span = Math.max(1, cfg.span);
    var phase = (t - sweepStart) % span;
    if (phase < 0) phase += span;
    var x = Math.floor(phase * W / span);
    if (x >= W) x = W - 1;
    return x;
  }

  function clearColumns(a, b) {
    if (a > b) return;
    g.reset().clearRect(a, 0, b, H - 1);
  }

  function advanceSweep(t) {
    if (!measuring || !Bangle.isLCDOn()) return graphX(t);
    var x = graphX(t);
    if (lastSweepX < 0) {
      lastSweepX = x;
      return x;
    }
    if (x === lastSweepX) return x;

    if (x > lastSweepX) {
      clearColumns(lastSweepX + 1, Math.min(W - 1, x + 1));
    } else {
      clearColumns(lastSweepX + 1, W - 1);
      clearColumns(0, Math.min(W - 1, x + 1));
      lastPlot.ax = lastPlot.ay = lastPlot.az = lastPlot.p = null;
    }
    lastSweepX = x;
    return x;
  }

  function valueToY(k, v) {
    var c = cfg[k];
    var lo = k === "p" ? c.ymin : cfg.accYmin;
    var hi = k === "p" ? c.ymax : cfg.accYmax;
    if (!(hi > lo)) hi = lo + 1;
    var f = (v - lo) / (hi - lo);
    var y = Math.round((1 - f) * (H - 1));
    if (y < 0) y = 0;
    if (y >= H) y = H - 1;
    return y;
  }

  function plotSample(k, v, t) {
    if (!cfg[k].graph || !Bangle.isLCDOn()) return;
    var x = advanceSweep(t);
    var y = valueToY(k, v);
    var lp = lastPlot[k];
    g.setColor(COLORS[k]);
    if (!lp || x < lp.x) {
      g.setPixel(x, y);
    } else {
      g.drawLine(lp.x, lp.y, x, y);
    }
    lastPlot[k] = { x: x, y: y };
  }

  function onAccel(a) {
    if (!measuring) return;
    var t = getTime();
    advanceSweep(t);

    var lin = removeGravity(a, t);
    var vals = {};
    var any = false;
    var accepted;

    accepted = processValue("ax", lin.x, t);
    if (accepted && cfg.ax.rec) { vals.ax = lin.x; any = true; }

    accepted = processValue("ay", lin.y, t);
    if (accepted && cfg.ay.rec) { vals.ay = lin.y; any = true; }

    accepted = processValue("az", lin.z, t);
    if (accepted && cfg.az.rec) { vals.az = lin.z; any = true; }

    checkAccelStableReset(t);

    if (any) appendLog(t, vals);
  }

  function onPressure(e) {
    if (!measuring) return;
    var t = getTime();
    advanceSweep(t);
    if (processValue("p", e.pressure, t) && cfg.p.rec) {
      appendLog(t, { p: e.pressure });
    }
  }

  function accelHardwareHz() {
    var h = Math.max(cfg.ax.hz, cfg.ay.hz, cfg.az.hz);
    if (h <= 12.5) return 12.5;
    if (h <= 25) return 25;
    if (h <= 50) return 50;
    return 100;
  }

  function setAccelerometer() {
    var hz = accelHardwareHz();
    var code = hz === 100 ? 3 : (hz === 50 ? 2 : (hz === 25 ? 1 : 0));
    try {
      Bangle.setOptions({ powerSave: false });
      Bangle.accelWr(0x18, 0b01101100); // standby, +/-4g
      Bangle.accelWr(0x1B, code ? (code | 0x40) : 0); // ODR, ODR/2 filter when >12.5 Hz
      Bangle.accelWr(0x18, 0b11101100); // operating, +/-4g
      Bangle.setPollInterval(Math.round(1000 / hz));
    } catch (e) {
      Bangle.setPollInterval(Math.max(10, Math.round(1000 / hz)));
    }
  }

  function restoreAccelerometer() {
    try {
      Bangle.setPollInterval(80);
      Bangle.accelWr(0x18, 0b01101100);
      Bangle.accelWr(0x1B, 0x00);
      Bangle.accelWr(0x18, 0b11101100);
      Bangle.setOptions({ powerSave: oldPowerSave });
    } catch (e) {}
  }

  function clearGraph() {
    g.reset().clearRect(0, 0, W - 1, H - 1);
    lastSweepX = -1;
    lastPlot = { ax: null, ay: null, az: null, p: null };
    sweepStart = getTime();
  }

  function startMeasurement() {
    if (measuring) return;
    E.showMenu();
    resetStates();
    clearGraph();
    setAccelerometer();
    try { Bangle.setBarometerPower(1, APP_ID); } catch (e) {}
    Bangle.on("accel", onAccel);
    Bangle.on("pressure", onPressure);
    measuring = true;
    Bangle.setUI({
      mode: "custom",
      touch: function () { setTimeout(showSettings, 0); },
      btn: exitApp
    });
  }

  function stopMeasurement() {
    if (!measuring) return;
    measuring = false;
    Bangle.removeListener("accel", onAccel);
    Bangle.removeListener("pressure", onPressure);
    try { Bangle.setBarometerPower(0, APP_ID); } catch (e) {}
    restoreAccelerometer();
    flushLog();
  }

  function cleanup() {
    stopMeasurement();
    flushLog();
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = undefined;
    }
  }

  function exitApp() {
    cleanup();
    load();
  }

  function hzIndex(list, hz) {
    var idx = list.indexOf(hz);
    if (idx < 0) idx = 0;
    return idx;
  }

  function channelMenu(k, title, hzList, yStep, yLimit) {
    var c = cfg[k];
    var menu = {
      "": { title: title },
      "< Back": showSettings,
      "Sample Hz": {
        value: hzIndex(hzList, c.hz),
        min: 0,
        max: hzList.length - 1,
        step: 1,
        format: function (v) { return hzList[v] + " Hz"; },
        onchange: function (v) { c.hz = hzList[v]; saveSettings(); }
      },
      "Store": {
        value: !!c.rec,
        onchange: function (v) { c.rec = !!v; saveSettings(); }
      },
      "Graph": {
        value: !!c.graph,
        onchange: function (v) { c.graph = !!v; saveSettings(); }
      }
    };

    if (k === "p") {
      menu.Integrate = {
        value: c.integ | 0,
        min: 0,
        max: 2,
        step: 1,
        onchange: function (v) { c.integ = v | 0; saveSettings(); }
      };
      menu["Y min"] = {
        value: c.ymin,
        min: -yLimit,
        max: yLimit,
        step: yStep,
        onchange: function (v) {
          c.ymin = v;
          if (!(c.ymax > c.ymin)) c.ymax = c.ymin + yStep;
          saveSettings();
        }
      };
      menu["Y max"] = {
        value: c.ymax,
        min: -yLimit,
        max: yLimit,
        step: yStep,
        onchange: function (v) {
          c.ymax = v;
          if (!(c.ymax > c.ymin)) c.ymin = c.ymax - yStep;
          saveSettings();
        }
      };
    }
    E.showMenu(menu);
  }

  function showSettings() {
    if (measuring) stopMeasurement();
    var menu = {
      "": { title: "sensY settings" },
      "< Back": startMeasurement,
      "Span (s)": {
        value: cfg.span,
        min: 1,
        max: 300,
        step: 1,
        onchange: function (v) { cfg.span = v; saveSettings(); }
      },
      "Accel Integrate": {
        value: cfg.accInteg | 0,
        min: 0,
        max: 2,
        step: 1,
        onchange: function (v) { cfg.accInteg = v | 0; saveSettings(); }
      },
      "Accel Y min": {
        value: cfg.accYmin,
        min: -10000,
        max: 10000,
        step: 0.1,
        onchange: function (v) {
          cfg.accYmin = v;
          if (!(cfg.accYmax > cfg.accYmin)) cfg.accYmax = cfg.accYmin + 0.1;
          saveSettings();
        }
      },
      "Accel Y max": {
        value: cfg.accYmax,
        min: -10000,
        max: 10000,
        step: 0.1,
        onchange: function (v) {
          cfg.accYmax = v;
          if (!(cfg.accYmax > cfg.accYmin)) cfg.accYmin = cfg.accYmax - 0.1;
          saveSettings();
        }
      },
      "Accel X >": function () { channelMenu("ax", "Accel X", ACC_HZ, 0.1, 10000); },
      "Accel Y >": function () { channelMenu("ay", "Accel Y", ACC_HZ, 0.1, 10000); },
      "Accel Z >": function () { channelMenu("az", "Accel Z", ACC_HZ, 0.1, 10000); },
      "Pressure >": function () { channelMenu("p", "Pressure", PRESS_HZ, 1, 100000); }
    };
    E.showMenu(menu);
  }

  Bangle.on("lcdPower", function (on) {
    if (on && measuring) clearGraph();
  });

  cfg = loadSettings();
  flushTimer = setInterval(flushLog, 5000);
  E.on("kill", cleanup);
  startMeasurement();
}());
