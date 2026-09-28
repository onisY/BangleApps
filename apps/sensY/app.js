/*
 * sensY - research accelerometer/barometer sweep logger
 * Bangle.js 2
 */
(function () {
  var Storage = require("Storage");
  var VERSION = "0.019";
  var SETTINGS_FILE = "sensY.json";
  var APP_ID = "sensY";

  var ACC_HZ = [1, 2, 5, 10, 12.5, 25, 50, 100];

  var COLOR_NAMES = ["White", "Red", "Green", "Blue", "Yellow", "Cyan", "Magenta"];
  var COLOR_VALUES = ["#fff", "#f00", "#0f0", "#00f", "#ff0", "#0ff", "#f0f"];
  var BG = "#000";
  var FG = "#fff";
  var SWEEP_COLOR = "#f00";

  var DEFAULTS = {
    accHz: 12.5,
    pressureInterval: 1,
    accStore: false,
    pressureStore: false,
    accGraph: true,
    pressureGraph: true,
    pressureColor: 6,
    pressureWidth: 1,
    accColor: 5,
    accWidth: 1,
    accAutoScale: true,
    accYmin: 0,
    accYmax: 2
  };

  var GRAVITY_TAU = 0.8;
  var PRESSURE_MIN_SPAN = 0.5;
  var ACC_MIN_SPAN = 0.01;
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
  var samples = new Array(PLOT_W);
  var sweepIndex = 0;
  var sweepGeneration = 1;
  var displayPressureScale = null;
  var displayAccelScale = null;

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

  var originalOptions = {};
  var oldPowerSave = true;
  try {
    originalOptions = Bangle.getOptions() || {};
    if (originalOptions.powerSave !== undefined)
      oldPowerSave = originalOptions.powerSave;
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
      pressureColor: DEFAULTS.pressureColor,
      pressureWidth: DEFAULTS.pressureWidth,
      accColor: DEFAULTS.accColor,
      accWidth: DEFAULTS.accWidth,
      accAutoScale: DEFAULTS.accAutoScale,
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

    if (typeof s.pressureColor === "number") d.pressureColor = s.pressureColor | 0;
    if (typeof s.pressureWidth === "number") d.pressureWidth = s.pressureWidth | 0;
    if (typeof s.accColor === "number") d.accColor = s.accColor | 0;
    if (typeof s.accWidth === "number") d.accWidth = s.accWidth | 0;
    if (typeof s.accAutoScale === "boolean") d.accAutoScale = s.accAutoScale;

    if (typeof s.accYmin === "number") d.accYmin = Math.max(0, s.accYmin);
    if (typeof s.accYmax === "number") d.accYmax = s.accYmax;

    if (ACC_HZ.indexOf(d.accHz) < 0) d.accHz = DEFAULTS.accHz;
    d.pressureInterval = clamp(Math.round(d.pressureInterval * 2) / 2, 0.5, 120);
    d.pressureColor = clamp(d.pressureColor, 0, COLOR_VALUES.length - 1);
    d.accColor = clamp(d.accColor, 0, COLOR_VALUES.length - 1);
    d.pressureWidth = clamp(d.pressureWidth, 1, 5);
    d.accWidth = clamp(d.accWidth, 1, 5);
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

  function keepScreenOn() {
    try {
      Bangle.setOptions({
        lockTimeout:0,
        lcdPowerTimeout:0,
        backlightTimeout:0
      });
      Bangle.setLocked(0);
      Bangle.setLCDPower(1);
      if (Bangle.setBacklight) Bangle.setBacklight(1);
    } catch (e) {
      try {
        Bangle.setLCDPower(1);
        Bangle.setLCDTimeout(0);
      } catch (e2) {}
    }
  }

  function restoreScreenTimeouts() {
    try {
      Bangle.setOptions({
        lockTimeout:originalOptions.lockTimeout,
        lcdPowerTimeout:originalOptions.lcdPowerTimeout,
        backlightTimeout:originalOptions.backlightTimeout
      });
    } catch (e) {
      try {
        if (originalOptions.lockTimeout !== undefined)
          Bangle.setLCDTimeout(originalOptions.lockTimeout / 1000);
      } catch (e2) {}
    }
  }

  function resetAcquisitionWindow() {
    resetGravity();
    accSum = 0;
    accCount = 0;
    var now = getTime();
    nextAccelT = now;
    nextPressureT = now + cfg.pressureInterval;
  }

  function resetSweep() {
    samples = new Array(PLOT_W);
    sweepIndex = 0;
    sweepGeneration = 1;
    displayPressureScale = null;
    displayAccelScale = cfg && cfg.accAutoScale ?
      { lo:cfg.accYmin, hi:cfg.accYmax } : null;
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

  function sampleRange(key) {
    var min = Infinity;
    var max = -Infinity;
    var n = 0;

    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (!s) continue;
      var v = s[key];
      if (v === null || v === undefined || !isFinite(v)) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
      n++;
    }
    return n ? { min:min, max:max, n:n } : null;
  }

  function makeScale(range, span, nonnegative) {
    var center = (range.min + range.max) / 2;
    var lo = center - span / 2;
    var hi = center + span / 2;

    if (nonnegative && lo < 0) {
      hi -= lo;
      lo = 0;
    }
    return { lo:lo, hi:hi };
  }

  function expandScale(scale, range, minSpan, nonnegative) {
    if (!range) return { scale:scale, changed:false };

    if (!scale) {
      var firstSpan = minSpan;
      while (range.max - range.min >= firstSpan) firstSpan *= 2;
      return {
        scale:makeScale(range, firstSpan, nonnegative),
        changed:true
      };
    }

    if (range.min > scale.lo && range.max < scale.hi)
      return { scale:scale, changed:false };

    var span = Math.max(minSpan, scale.hi - scale.lo) * 2;
    while (range.max - range.min >= span) span *= 2;

    return {
      scale:makeScale(range, span, nonnegative),
      changed:true
    };
  }

  function shrinkScale(scale, range, minSpan, nonnegative) {
    if (!scale || !range) return { scale:scale, changed:false };

    var span = scale.hi - scale.lo;
    if (span <= minSpan * 1.0001)
      return { scale:scale, changed:false };

    /*
     * Hysteresis: only halve when the visible data occupies at most one
     * quarter of the current full scale. After halving, the data therefore
     * still occupies at most half the new scale and does not stick to an edge.
     */
    if (range.max - range.min > span / 4)
      return { scale:scale, changed:false };

    var nextSpan = Math.max(minSpan, span / 2);
    return {
      scale:makeScale(range, nextSpan, nonnegative),
      changed:true
    };
  }

  function expandAutoScales() {
    var changed = false;
    var r = expandScale(
      displayPressureScale,
      sampleRange("p"),
      PRESSURE_MIN_SPAN,
      false
    );
    displayPressureScale = r.scale;
    changed = changed || r.changed;

    if (cfg.accAutoScale) {
      r = expandScale(
        displayAccelScale,
        sampleRange("a"),
        ACC_MIN_SPAN,
        true
      );
      displayAccelScale = r.scale;
      changed = changed || r.changed;
    }

    return changed;
  }

  function shrinkAutoScales() {
    var changed = false;
    var r = shrinkScale(
      displayPressureScale,
      sampleRange("p"),
      PRESSURE_MIN_SPAN,
      false
    );
    displayPressureScale = r.scale;
    changed = changed || r.changed;

    if (cfg.accAutoScale) {
      r = shrinkScale(
        displayAccelScale,
        sampleRange("a"),
        ACC_MIN_SPAN,
        true
      );
      displayAccelScale = r.scale;
      changed = changed || r.changed;
    }

    return changed;
  }

  function pressureY(v) {
    if (!displayPressureScale) return Math.round((PLOT_Y0 + PLOT_Y1) / 2);
    var f = (v - displayPressureScale.lo) /
            (displayPressureScale.hi - displayPressureScale.lo);
    return clamp(Math.round(PLOT_Y1 - f * (PLOT_H - 1)), PLOT_Y0, PLOT_Y1);
  }

  function accelY(v) {
    var scale = cfg.accAutoScale && displayAccelScale ?
      displayAccelScale : { lo:cfg.accYmin, hi:cfg.accYmax };
    var f = (v - scale.lo) / (scale.hi - scale.lo);
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

  function drawPressureAxis() {
    g.setColor(BG).fillRect(0, 0, PLOT_X0 - 1, PLOT_Y1);
    if (!cfg.pressureGraph || !displayPressureScale) return;

    var mid = (displayPressureScale.lo + displayPressureScale.hi) / 2;
    var ys = [PLOT_Y0, Math.round((PLOT_Y0 + PLOT_Y1) / 2), PLOT_Y1];
    var vs = [displayPressureScale.hi, mid, displayPressureScale.lo];

    g.setColor(FG).setFont("4x6").setFontAlign(-1, -1);
    g.drawString("mbar", 0, 0);
    g.setFontAlign(1, 0);
    for (var i = 0; i < 3; i++) {
      g.drawString(vs[i].toFixed(1), PLOT_X0 - 4, ys[i]);
      g.drawLine(PLOT_X0 - 2, ys[i], PLOT_X0, ys[i]);
    }
  }

  function drawXAxis() {
    g.setColor(BG).fillRect(PLOT_X0, PLOT_Y1 + 1, PLOT_X1, H - 1);
    var span = (PLOT_W - 1) * cfg.pressureInterval;
    g.setColor(FG).setFont("4x6").setFontAlign(-1, -1);
    g.drawString(cfg.pressureInterval + "s/px", PLOT_X0, H - 7);
    g.setFontAlign(1, -1);
    g.drawString("span " + formatDuration(span), PLOT_X1, H - 7);
  }

  function clearPlotColumn(idx) {
    if (idx < 0 || idx >= PLOT_W) return;
    var x = PLOT_X0 + idx;
    g.setColor(BG).fillRect(x, PLOT_Y0, x, PLOT_Y1);
  }

  function clearSweepColumns(idx) {
    clearPlotColumn(idx);
    clearPlotColumn((idx + 1) % PLOT_W);
  }

  function sameGeneration(a, b) {
    return a && b && a.gen === b.gen;
  }

  function drawThickPoint(x, y, color, width) {
    g.setColor(color);
    var lo = -Math.floor((width - 1) / 2);
    var hi = Math.ceil((width - 1) / 2);
    for (var o = lo; o <= hi; o++) {
      var yy = y + o;
      if (yy >= PLOT_Y0 && yy <= PLOT_Y1) g.setPixel(x, yy);
    }
  }

  function drawThickLine(x1, y1, x2, y2, color, width) {
    g.setColor(color);
    var lo = -Math.floor((width - 1) / 2);
    var hi = Math.ceil((width - 1) / 2);
    for (var o = lo; o <= hi; o++) {
      var yy1 = clamp(y1 + o, PLOT_Y0, PLOT_Y1);
      var yy2 = clamp(y2 + o, PLOT_Y0, PLOT_Y1);
      g.drawLine(x1, yy1, x2, yy2);
    }
  }

  function drawSampleAt(idx) {
    var s = samples[idx];
    if (!s) return;
    var x = PLOT_X0 + idx;
    var prev = idx > 0 ? samples[idx - 1] : null;

    if (cfg.pressureGraph && isFinite(s.p)) {
      var py = pressureY(s.p);
      var pc = COLOR_VALUES[cfg.pressureColor];
      if (sameGeneration(prev, s) && isFinite(prev.p))
        drawThickLine(x - 1, pressureY(prev.p), x, py, pc, cfg.pressureWidth);
      else
        drawThickPoint(x, py, pc, cfg.pressureWidth);
    }

    if (cfg.accGraph && s.a !== null && isFinite(s.a)) {
      var ay = accelY(s.a);
      var ac = COLOR_VALUES[cfg.accColor];
      if (sameGeneration(prev, s) && prev.a !== null && isFinite(prev.a))
        drawThickLine(x - 1, accelY(prev.a), x, ay, ac, cfg.accWidth);
      else
        drawThickPoint(x, ay, ac, cfg.accWidth);
    }
  }

  function drawSweepCursor() {
    var x = PLOT_X0 + sweepIndex;
    g.setColor(SWEEP_COLOR).drawLine(x, PLOT_Y0, x, PLOT_Y1);
  }

  function drawFullGraph() {
    g.reset().setColor(BG).fillRect(0, 0, W - 1, H - 1);
    drawPressureAxis();
    drawXAxis();

    for (var i = 0; i < PLOT_W; i++)
      drawSampleAt(i);

    drawSweepCursor();
    if (paused) drawPausedOverlay();
  }

  function updateSweep(sample) {
    var idx = sweepIndex;
    var next = (idx + 1) % PLOT_W;

    clearSweepColumns(idx);
    samples[idx] = sample;

    /*
     * Expand immediately when any visible pressure/acceleration value reaches
     * or exceeds the current full scale. Expansion is in x2 steps and the
     * whole graph is redrawn so old pixels are remapped to the new scale.
     */
    var scaleChanged = expandAutoScales();
    sweepIndex = next;

    if (next === 0) {
      /*
       * Shrinking is deliberately slower than expansion. It is considered
       * only once per completed sweep and only when the data occupies <= 1/4
       * of the current range, then the full scale is halved once.
       */
      if (!scaleChanged) shrinkAutoScales();
      sweepGeneration++;
      drawFullGraph();
    } else if (scaleChanged) {
      drawFullGraph();
    } else {
      drawSampleAt(idx);
      drawSweepCursor();
    }
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

    var sample = {
      t:t,
      p:e.pressure,
      a:accAvg,
      gen:sweepGeneration
    };

    appendLog(t, accAvg, e.pressure);
    if (Bangle.isLCDOn()) updateSweep(sample);
    else {
      samples[sweepIndex] = sample;
      var scaleChanged = expandAutoScales();
      sweepIndex = (sweepIndex + 1) % PLOT_W;
      if (sweepIndex === 0) {
        if (!scaleChanged) shrinkAutoScales();
        sweepGeneration++;
      }
    }
  }

  function drawPausedOverlay() {
    var w = 94;
    var h = 30;
    var x = Math.round((W - w) / 2);
    var y = Math.round((H - h) / 2);
    g.setColor(BG).fillRect(x, y, x + w, y + h);
    g.setColor(FG).drawRect(x, y, x + w, y + h);
    g.setColor(FG).setFont("6x8").setFontAlign(0, 0);
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

  function startAcquisition(resetGraph) {
    if (acquiring) return;
    if (resetGraph) resetSweep();
    paused = false;
    resetAcquisitionWindow();

    keepScreenOn();
    setAccelerometer();
    if (accelEnabled()) Bangle.on("accel", onAccel);
    try { Bangle.setBarometerPower(1, APP_ID); } catch (e) {}
    Bangle.on("pressure", onPressure);
    acquiring = true;

    setupMeasurementUI();
    drawFullGraph();
  }

  function stopAcquisition() {
    if (!acquiring) {
      restoreScreenTimeouts();
      return;
    }
    acquiring = false;
    Bangle.removeListener("accel", onAccel);
    Bangle.removeListener("pressure", onPressure);
    try { Bangle.setBarometerPower(0, APP_ID); } catch (e) {}
    restoreAccelerometer();
    restoreScreenTimeouts();
    flushLog();
  }

  function pauseMeasurement() {
    if (paused) return;
    stopAcquisition();
    paused = true;
    setupMeasurementUI();
    if (Bangle.isLCDOn()) drawFullGraph();
  }

  function resumeMeasurement() {
    if (!paused) return;
    paused = false;
    resetAcquisitionWindow();

    keepScreenOn();
    setAccelerometer();
    if (accelEnabled()) Bangle.on("accel", onAccel);
    try { Bangle.setBarometerPower(1, APP_ID); } catch (e) {}
    Bangle.on("pressure", onPressure);
    acquiring = true;

    setupMeasurementUI();
    drawFullGraph();
  }

  function cleanup() {
    stopAcquisition();
    restoreScreenTimeouts();
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
        min:0.5,
        max:120,
        step:0.5,
        format:function (v) { return v.toFixed(1) + " s"; },
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
      "Pressure color": {
        value:cfg.pressureColor,
        min:0,
        max:COLOR_NAMES.length - 1,
        step:1,
        format:function (v) { return COLOR_NAMES[v]; },
        onchange:function (v) {
          cfg.pressureColor = v | 0;
          saveSettings();
        }
      },
      "Pressure width": {
        value:cfg.pressureWidth,
        min:1,
        max:5,
        step:1,
        format:function (v) { return v + " px"; },
        onchange:function (v) {
          cfg.pressureWidth = v | 0;
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
      "Accel color": {
        value:cfg.accColor,
        min:0,
        max:COLOR_NAMES.length - 1,
        step:1,
        format:function (v) { return COLOR_NAMES[v]; },
        onchange:function (v) {
          cfg.accColor = v | 0;
          saveSettings();
        }
      },
      "Accel width": {
        value:cfg.accWidth,
        min:1,
        max:5,
        step:1,
        format:function (v) { return v + " px"; },
        onchange:function (v) {
          cfg.accWidth = v | 0;
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
      "Accel auto Y": {
        value:!!cfg.accAutoScale,
        onchange:function (v) {
          cfg.accAutoScale = !!v;
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
          if (!(cfg.accYmax > cfg.accYmin))
            cfg.accYmin = Math.max(0, cfg.accYmax - 0.01);
          saveSettings();
        }
      }
    });
  }

  Bangle.on("lcdPower", function (on) {
    if (on) drawFullGraph();
  });

  cfg = loadSettings();
  saveSettings();
  flushTimer = setInterval(flushLog, 5000);
  E.on("kill", cleanup);
  startAcquisition(true);
}());
