/*
 * sensY - research accelerometer/barometer point-plot logger
 * Bangle.js 2
 */
(function () {
  var Storage = require("Storage");
  var VERSION = "0.015";
  var SETTINGS_FILE = "sensY.json";
  var APP_ID = "sensY";

  var ACC_HZ = [1, 2, 5, 10, 12.5, 25, 50, 100];

  var DEFAULTS = {
    accHz: 12.5,
    pressureInterval: 1,
    accStore: false,
    pressureStore: false,
    accGraph: true,
    pressureGraph: true,
    accYmin: 0,
    accYmax: 2
  };

  var COLORS = g.theme.dark ? {
    pressure: "#f0f",
    accel: "#0ff",
    sweep: "#f00"
  } : {
    pressure: "#f0f",
    accel: "#00f",
    sweep: "#f00"
  };

  var GRAVITY_TAU = 0.8;
  var gravity = { init:false, x:0, y:0, z:0, t:0 };

  var W = g.getWidth();
  var H = g.getHeight();
  var AXIS_W = 30;
  var PLOT_X0 = AXIS_W;
  var PLOT_X1 = W - 1;
  var PLOT_Y0 = 8;
  var PLOT_Y1 = H - 15;
  var PLOT_W = PLOT_X1 - PLOT_X0 + 1;
  var PLOT_H = PLOT_Y1 - PLOT_Y0 + 1;

  var cfg;
  var history = [];
  var acquiring = false;
  var paused = false;
  var accelConfigured = false;

  var nextAccelT;
  var nextPressureT;
  var accSum = 0;
  var accCount = 0;

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

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function loadSettings() {
    var s = Storage.readJSON(SETTINGS_FILE, 1) || {};
    var d = {
      accHz: DEFAULTS.accHz,
      pressureInterval: DEFAULTS.pressureInterval,
      accStore: DEFAULTS.accStore,
      pressureStore: DEFAULTS.pressureStore,
      accGraph: DEFAULTS.accGraph,
      pressureGraph: DEFAULTS.pressureGraph,
      accYmin: DEFAULTS.accYmin,
      accYmax: DEFAULTS.accYmax
    };

    if (typeof s.accHz === "number") d.accHz = s.accHz;
    else if (s.ax && typeof s.ax.hz === "number") d.accHz = s.ax.hz;

    if (typeof s.pressureInterval === "number") d.pressureInterval = s.pressureInterval;
    else if (s.p && typeof s.p.hz === "number" && s.p.hz > 0)
      d.pressureInterval = Math.round(1 / s.p.hz);

    if (typeof s.accStore === "boolean") d.accStore = s.accStore;
    else d.accStore = !!((s.ax && s.ax.rec) || (s.ay && s.ay.rec) || (s.az && s.az.rec));

    if (typeof s.pressureStore === "boolean") d.pressureStore = s.pressureStore;
    else if (s.p && s.p.rec !== undefined) d.pressureStore = !!s.p.rec;

    if (typeof s.accGraph === "boolean") d.accGraph = s.accGraph;
    else d.accGraph = !!((s.ax && s.ax.graph) || (s.ay && s.ay.graph) || (s.az && s.az.graph));

    if (typeof s.pressureGraph === "boolean") d.pressureGraph = s.pressureGraph;
    else if (s.p && s.p.graph !== undefined) d.pressureGraph = !!s.p.graph;

    if (typeof s.accYmin === "number") d.accYmin = Math.max(0, s.accYmin);
    if (typeof s.accYmax === "number") d.accYmax = s.accYmax;

    if (ACC_HZ.indexOf(d.accHz) < 0) d.accHz = DEFAULTS.accHz;
    d.pressureInterval = clamp(Math.round(d.pressureInterval), 1, 300);
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
    logFile.write("t_s,acc_mag_avg_g,p_hPa\n");
  }

  function flushLog() {
    if (logFile && logBuf) {
      logFile.write(logBuf);
      logBuf = "";
    }
  }

  function appendLog(t, accAvg, pressure) {
    if (!cfg.accStore && !cfg.pressureStore) return;
    ensureLog();
    var row = [(t - sessionStartT).toFixed(3)];
    row.push(cfg.accStore && accAvg !== null ? accAvg.toFixed(6) : "");
    row.push(cfg.pressureStore ? pressure.toFixed(3) : "");
    logBuf += row.join(",") + "\n";
    if (logBuf.length >= 768) flushLog();
  }

  function resetGravity() {
    gravity = { init:false, x:0, y:0, z:0, t:0 };
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
    if (m < 0.05) return { x:a.x, y:a.y, z:a.z };

    return {
      x: a.x - gravity.x / m,
      y: a.y - gravity.y / m,
      z: a.z - gravity.z / m
    };
  }

  function accelEnabled() {
    return cfg.accGraph || cfg.accStore;
  }

  function accelHardwareHz() {
    var h = cfg.accHz;
    if (h <= 12.5) return 12.5;
    if (h <= 25) return 25;
    if (h <= 50) return 50;
    return 100;
  }

  function setAccelerometer() {
    if (!accelEnabled()) return;
    var hz = accelHardwareHz();
    var code = hz === 100 ? 3 : (hz === 50 ? 2 : (hz === 25 ? 1 : 0));
    try {
      Bangle.setOptions({ powerSave:false });
      Bangle.accelWr(0x18, 0b01101100);
      Bangle.accelWr(0x1B, code ? (code | 0x40) : 0);
      Bangle.accelWr(0x18, 0b11101100);
      Bangle.setPollInterval(Math.round(1000 / hz));
      accelConfigured = true;
    } catch (e) {
      Bangle.setPollInterval(Math.max(10, Math.round(1000 / hz)));
      accelConfigured = true;
    }
  }

  function restoreAccelerometer() {
    if (!accelConfigured) return;
    try {
      Bangle.setPollInterval(80);
      Bangle.accelWr(0x18, 0b01101100);
      Bangle.accelWr(0x1B, 0x00);
      Bangle.accelWr(0x18, 0b11101100);
      Bangle.setOptions({ powerSave:oldPowerSave });
    } catch (e) {}
    accelConfigured = false;
  }

  function resetAcquisitionWindow() {
    resetGravity();
    accSum = 0;
    accCount = 0;
    var now = getTime();
    nextAccelT = now;
    nextPressureT = now + cfg.pressureInterval;
  }

  function onAccel(a) {
    if (!acquiring || !accelEnabled()) return;
    var t = getTime();
    var lin = removeGravity(a, t);

    if (t + 0.0005 < nextAccelT) return;
    var period = 1 / cfg.accHz;
    do {
      nextAccelT += period;
    } while (nextAccelT <= t);

    var mag = Math.sqrt(
      lin.x * lin.x +
      lin.y * lin.y +
      lin.z * lin.z
    );
    accSum += mag;
    accCount++;
  }

  function onPressure(e) {
    if (!acquiring) return;
    var t = getTime();
    if (t + 0.0005 < nextPressureT) return;

    do {
      nextPressureT += cfg.pressureInterval;
    } while (nextPressureT <= t);

    var accAvg = accCount ? accSum / accCount : null;
    accSum = 0;
    accCount = 0;

    var sample = { t:t, p:e.pressure, a:accAvg };
    history.push(sample);
    if (history.length > PLOT_W) history.shift();

    appendLog(t, accAvg, e.pressure);
    if (Bangle.isLCDOn()) drawGraph();
  }

  function pressureScale() {
    if (!history.length) return null;
    var min = Infinity;
    var max = -Infinity;
    var sum = 0;
    var n = 0;

    history.forEach(function (s) {
      if (s.p === undefined || !isFinite(s.p)) return;
      min = Math.min(min, s.p);
      max = Math.max(max, s.p);
      sum += s.p;
      n++;
    });
    if (!n) return null;

    if (max - min <= 1) {
      var mean = sum / n;
      return { lo:mean - 0.5, hi:mean + 0.5 };
    }
    return { lo:min, hi:max };
  }

  function pressureY(v, scale) {
    var f = (v - scale.lo) / (scale.hi - scale.lo);
    return clamp(Math.round(PLOT_Y1 - f * (PLOT_H - 1)), PLOT_Y0, PLOT_Y1);
  }

  function accelY(v) {
    var f = (v - cfg.accYmin) / (cfg.accYmax - cfg.accYmin);
    return clamp(Math.round(PLOT_Y1 - f * (PLOT_H - 1)), PLOT_Y0, PLOT_Y1);
  }

  function formatDuration(sec) {
    sec = Math.round(sec);
    if (sec < 60) return sec + "s";
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    if (m < 60) return s ? (m + "m" + s + "s") : (m + "m");
    var h = Math.floor(m / 60);
    m %= 60;
    return m ? (h + "h" + m + "m") : (h + "h");
  }

  function drawPressureAxis(scale) {
    if (!cfg.pressureGraph || !scale) return;
    var mid = (scale.lo + scale.hi) / 2;
    var ys = [PLOT_Y0, Math.round((PLOT_Y0 + PLOT_Y1) / 2), PLOT_Y1];
    var vs = [scale.hi, mid, scale.lo];

    g.setColor(g.theme.fg).setFont("4x6").setFontAlign(-1, -1);
    g.drawString("mbar", 0, 0);
    g.setFontAlign(1, 0);
    for (var i = 0; i < 3; i++) {
      g.drawString(vs[i].toFixed(1), PLOT_X0 - 4, ys[i]);
      g.drawLine(PLOT_X0 - 2, ys[i], PLOT_X0, ys[i]);
    }
  }

  function drawXAxis() {
    var span = (PLOT_W - 1) * cfg.pressureInterval;
    g.setColor(g.theme.fg).setFont("4x6").setFontAlign(-1, -1);
    g.drawString(cfg.pressureInterval + "s/px", PLOT_X0, H - 7);
    g.setFontAlign(1, -1);
    g.drawString("span " + formatDuration(span), PLOT_X1, H - 7);
  }

  function drawGraph() {
    g.reset().clear();
    var pScale = pressureScale();
    drawPressureAxis(pScale);
    drawXAxis();

    var prevAccX = null;
    var prevAccY = null;

    for (var i = 0; i < history.length; i++) {
      var x = PLOT_X0 + i;
      var s = history[i];

      if (cfg.pressureGraph && pScale && isFinite(s.p)) {
        g.setColor(COLORS.pressure).setPixel(x, pressureY(s.p, pScale));
      }

      if (cfg.accGraph && s.a !== null && isFinite(s.a)) {
        var ay = accelY(s.a);
        g.setColor(COLORS.accel);
        if (prevAccX === null) g.setPixel(x, ay);
        else g.drawLine(prevAccX, prevAccY, x, ay);
        prevAccX = x;
        prevAccY = ay;
      } else {
        prevAccX = null;
        prevAccY = null;
      }
    }

    if (history.length) {
      var sweepX = PLOT_X0 + history.length - 1;
      g.setColor(COLORS.sweep).drawLine(sweepX, PLOT_Y0, sweepX, PLOT_Y1);
    }

    if (paused) drawPausedOverlay();
  }

  function drawPausedOverlay() {
    var w = 94;
    var h = 30;
    var x = Math.round((W - w) / 2);
    var y = Math.round((H - h) / 2);
    g.setColor(g.theme.bg).fillRect(x, y, x + w, y + h);
    g.setColor(g.theme.fg).drawRect(x, y, x + w, y + h);
    g.setFont("6x8").setFontAlign(0, 0);
    g.drawString("PAUSED", W / 2, y + 9);
    g.setFont("4x6");
    g.drawString("swipe up to resume", W / 2, y + 21);
  }

  function setupMeasurementUI() {
    Bangle.setUI({
      mode:"custom",
      touch:function () {
        setTimeout(showSettings, 0);
      },
      swipe:function (lr, ud) {
        if (ud === 1) pauseMeasurement();
        else if (ud === -1) resumeMeasurement();
      },
      btn:exitApp
    });
  }

  function startAcquisition(resetHistory) {
    if (acquiring) return;
    if (resetHistory) history = [];
    paused = false;
    resetAcquisitionWindow();

    setAccelerometer();
    if (accelEnabled()) Bangle.on("accel", onAccel);
    try { Bangle.setBarometerPower(1, APP_ID); } catch (e) {}
    Bangle.on("pressure", onPressure);
    acquiring = true;

    setupMeasurementUI();
    if (Bangle.isLCDOn()) drawGraph();
  }

  function stopAcquisition() {
    if (!acquiring) return;
    acquiring = false;
    Bangle.removeListener("accel", onAccel);
    Bangle.removeListener("pressure", onPressure);
    try { Bangle.setBarometerPower(0, APP_ID); } catch (e) {}
    restoreAccelerometer();
    flushLog();
  }

  function pauseMeasurement() {
    if (paused) return;
    stopAcquisition();
    paused = true;
    setupMeasurementUI();
    if (Bangle.isLCDOn()) drawGraph();
  }

  function resumeMeasurement() {
    if (!paused) return;
    paused = false;
    resetAcquisitionWindow();
    setAccelerometer();
    if (accelEnabled()) Bangle.on("accel", onAccel);
    try { Bangle.setBarometerPower(1, APP_ID); } catch (e) {}
    Bangle.on("pressure", onPressure);
    acquiring = true;
    setupMeasurementUI();
    if (Bangle.isLCDOn()) drawGraph();
  }

  function cleanup() {
    stopAcquisition();
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

  function hzIndex(hz) {
    var idx = ACC_HZ.indexOf(hz);
    return idx < 0 ? 4 : idx;
  }

  function showSettings() {
    stopAcquisition();
    paused = true;

    E.showMenu({
      "": { title:"sensY settings" },
      "< Back": function () {
        E.showMenu();
        startAcquisition(true);
      },
      "Pressure int s": {
        value:cfg.pressureInterval,
        min:1,
        max:300,
        step:1,
        onchange:function (v) {
          cfg.pressureInterval = v;
          saveSettings();
        }
      },
      "Pressure graph": {
        value:!!cfg.pressureGraph,
        onchange:function (v) {
          cfg.pressureGraph = !!v;
          saveSettings();
        }
      },
      "Pressure store": {
        value:!!cfg.pressureStore,
        onchange:function (v) {
          cfg.pressureStore = !!v;
          saveSettings();
        }
      },
      "Accel Hz": {
        value:hzIndex(cfg.accHz),
        min:0,
        max:ACC_HZ.length - 1,
        step:1,
        format:function (v) { return ACC_HZ[v] + " Hz"; },
        onchange:function (v) {
          cfg.accHz = ACC_HZ[v];
          saveSettings();
        }
      },
      "Accel graph": {
        value:!!cfg.accGraph,
        onchange:function (v) {
          cfg.accGraph = !!v;
          saveSettings();
        }
      },
      "Accel store": {
        value:!!cfg.accStore,
        onchange:function (v) {
          cfg.accStore = !!v;
          saveSettings();
        }
      },
      "Accel Y min": {
        value:cfg.accYmin,
        min:0,
        max:100,
        step:0.01,
        format:function (v) { return v.toFixed(2); },
        onchange:function (v) {
          cfg.accYmin = v;
          if (!(cfg.accYmax > cfg.accYmin)) cfg.accYmax = cfg.accYmin + 0.01;
          saveSettings();
        }
      },
      "Accel Y max": {
        value:cfg.accYmax,
        min:0.01,
        max:100,
        step:0.01,
        format:function (v) { return v.toFixed(2); },
        onchange:function (v) {
          cfg.accYmax = v;
          if (!(cfg.accYmax > cfg.accYmin)) cfg.accYmin = Math.max(0, cfg.accYmax - 0.01);
          saveSettings();
        }
      }
    });
  }

  Bangle.on("lcdPower", function (on) {
    if (on) drawGraph();
  });

  cfg = loadSettings();
  saveSettings();
  flushTimer = setInterval(flushLog, 5000);
  E.on("kill", cleanup);
  startAcquisition(true);
}());
