/*
 * sens - accelerometer/barometer research logger and sweep graph
 * Bangle.js 2
 */
(function () {
  var Storage = require("Storage");
  var VERSION = "0.01";
  var SETTINGS_FILE = "sens.json";
  var APP_ID = "sens";

  var ACC_HZ = [1, 2, 5, 10, 12.5, 25, 50, 100];
  var PRESS_HZ = [0.2, 0.5, 1];

  var DEFAULTS = {
    span: 10,
    ax: { hz: 12.5, rec: false, graph: true, integ: 0, ymin: -2, ymax: 2 },
    ay: { hz: 12.5, rec: false, graph: true, integ: 0, ymin: -2, ymax: 2 },
    az: { hz: 12.5, rec: false, graph: true, integ: 0, ymin: -2, ymax: 2 },
    p:  { hz: 1,    rec: false, graph: true, integ: 0, ymin: 950, ymax: 1050 }
  };

  var COLORS = {
    ax: "#f00",
    ay: "#0f0",
    az: "#00f",
    p:  "#ff0"
  };

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
    ["ax", "ay", "az", "p"].forEach(function (k) {
      if (!s[k]) return;
      Object.keys(d[k]).forEach(function (q) {
        if (s[k][q] !== undefined) d[k][q] = s[k][q];
      });
    });
    d.span = Math.max(1, Math.min(300, d.span));
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
    var stem = "sens" +
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
    logFile.write("t_s,ax_g,ay_g,az_g,p_hPa\n");
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
    lastPlot = { ax: null, ay: null, az: null, p: null };
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
    st.value = c.integ === 1 ? st.i1 : (c.integ === 2 ? st.i2 : raw);
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
    g.setColor(0).fillRect(a, 0, b, H - 1);
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
    var lo = c.ymin;
    var hi = c.ymax;
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

    var vals = {};
    var any = false;
    var accepted;

    accepted = processValue("ax", a.x, t);
    if (accepted && cfg.ax.rec) { vals.ax = a.x; any = true; }

    accepted = processValue("ay", a.y, t);
    if (accepted && cfg.ay.rec) { vals.ay = a.y; any = true; }

    accepted = processValue("az", a.z, t);
    if (accepted && cfg.az.rec) { vals.az = a.z; any = true; }

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
    g.reset().setColor(0).fillRect(0, 0, W - 1, H - 1);
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

  function exitApp() {
    stopMeasurement();
    flushLog();
    if (flushTimer) clearInterval(flushTimer);
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
      },
      "Integrate": {
        value: c.integ | 0,
        min: 0,
        max: 2,
        step: 1,
        onchange: function (v) { c.integ = v | 0; saveSettings(); }
      },
      "Y min": {
        value: c.ymin,
        min: -yLimit,
        max: yLimit,
        step: yStep,
        onchange: function (v) {
          c.ymin = v;
          if (!(c.ymax > c.ymin)) c.ymax = c.ymin + yStep;
          saveSettings();
        }
      },
      "Y max": {
        value: c.ymax,
        min: -yLimit,
        max: yLimit,
        step: yStep,
        onchange: function (v) {
          c.ymax = v;
          if (!(c.ymax > c.ymin)) c.ymin = c.ymax - yStep;
          saveSettings();
        }
      }
    };
    E.showMenu(menu);
  }

  function showSettings() {
    if (measuring) stopMeasurement();
    var menu = {
      "": { title: "sens settings" },
      "< Back": startMeasurement,
      "Span (s)": {
        value: cfg.span,
        min: 1,
        max: 300,
        step: 1,
        onchange: function (v) { cfg.span = v; saveSettings(); }
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
  startMeasurement();
}());
