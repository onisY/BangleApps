(function () {
  var Storage = require("Storage");
  var FILE = "orbit.json";
  var W = g.getWidth(), H = g.getHeight();
  var PI = Math.PI, TAU = PI * 2, RAD = PI / 180;
  var DAY = 86400000;
  var J1970 = 2440588, J2000 = 2451545;
  var SYNODIC = 29.530588853;
  var PHASE_ANCHOR = Date.UTC(2000, 0, 6, 18, 14, 0); // known new moon, UTC
  var EARTH_ORBIT_R = 42;
  var MOON_ORBIT_R = 18;
  var CX = Math.round(W / 2), CY = 92;
  var SLIDER_X0 = 10, SLIDER_X1 = W - 10, SLIDER_Y = H - 8;

  var defaults = {
    sunSize: 9,
    earthSize: 11,
    moonSize: 6,
    markerSize: 2,
    locationMode: 0, // 0 Auto GPS, 1 My Location, 2 Manual
    manualLat: 0,
    manualLon: 0,
    gpsTimeout: 30
  };
  var settings = Storage.readJSON(FILE, 1) || {};
  Object.keys(defaults).forEach(function (k) {
    if (settings[k] === undefined) settings[k] = defaults[k];
  });

  var C = {
    bg: "#000",
    fg: "#fff",
    orbit: "#555",
    sun: "#f22",
    flare: "#f80",
    earth: "#5cf",
    earthEdge: "#9ef",
    marker: "#f00",
    horizon: "#a4f",
    moon: "#fd4",
    penumbra: "#631",
    slider: "#777"
  };

  var loc = { lat: null, lon: null, source: "NONE" };
  var events = [];
  var sliderIndex = 0;
  var dragActive = false;
  var drawTimer;
  var gpsTimer;
  var gpsActive = false;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function norm(a) { a %= TAU; return a < 0 ? a + TAU : a; }
  function wrapPi(a) { a = norm(a); return a > PI ? a - TAU : a; }
  function toDays(date) {
    return date.valueOf() / DAY - 0.5 + J1970 - J2000;
  }

  function sunLon(date) {
    var d = toDays(date);
    var M = RAD * (357.5291 + 0.98560028 * d);
    var Cc = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    return norm(M + Cc + RAD * 102.9372 + PI);
  }

  function moonGeo(date) {
    var d = toDays(date);
    var L = RAD * (218.3164477 + 13.17639648 * d);
    var D = RAD * (297.8501921 + 12.19074912 * d);
    var M = RAD * (357.5291092 + 0.98560028 * d);
    var Mp = RAD * (134.9633964 + 13.06499295 * d);
    var F = RAD * (93.2720950 + 13.22935024 * d);
    var lon = L + RAD * (
      6.289 * Math.sin(Mp) + 1.274 * Math.sin(2 * D - Mp) +
      0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * Mp) -
      0.186 * Math.sin(M) - 0.114 * Math.sin(2 * F) +
      0.059 * Math.sin(2 * D - 2 * Mp) + 0.057 * Math.sin(2 * D - M - Mp) +
      0.053 * Math.sin(2 * D + Mp) + 0.046 * Math.sin(2 * D - M) +
      0.041 * Math.sin(M - Mp) - 0.035 * Math.sin(D) -
      0.031 * Math.sin(M + Mp) - 0.015 * Math.sin(2 * F - 2 * D) +
      0.011 * Math.sin(2 * D - 4 * Mp));
    var lat = RAD * (
      5.128 * Math.sin(F) + 0.280 * Math.sin(Mp + F) +
      0.277 * Math.sin(Mp - F) + 0.173 * Math.sin(2 * D - F) +
      0.055 * Math.sin(2 * D - Mp + F) + 0.046 * Math.sin(2 * D - Mp - F) +
      0.033 * Math.sin(2 * D + F) + 0.017 * Math.sin(2 * Mp + F));
    var dist = 385000.56 - 20905.355 * Math.cos(Mp) -
      3699.111 * Math.cos(2 * D - Mp) - 2955.968 * Math.cos(2 * D) -
      569.925 * Math.cos(2 * Mp) + 246.158 * Math.cos(2 * Mp - 2 * D) -
      204.586 * Math.cos(M - 2 * D) - 170.733 * Math.cos(Mp + 2 * D) -
      152.137 * Math.cos(Mp + M - 2 * D);
    return { lon: norm(lon), lat: lat, dist: dist };
  }

  function phaseAngle(date) {
    return norm(moonGeo(date).lon - sunLon(date));
  }

  function refinePhase(t, target) {
    var rate = TAU / (SYNODIC * DAY);
    for (var i = 0; i < 6; i++) {
      var err = wrapPi(phaseAngle(new Date(t)) - target);
      t -= err / rate;
    }
    return t;
  }

  // Exact greatest-eclipse UTC times, 2026-2030. The current one-year window
  // (2026-09-07 onward) is therefore anchored to NASA catalog times.
  var eclipseTable = [
    [Date.UTC(2026,1,17,12,13,6), "SOL ANNULAR", "solar"],
    [Date.UTC(2026,2,3,11,34,52), "LUN TOTAL", "lunar"],
    [Date.UTC(2026,7,12,17,47,6), "SOL TOTAL", "solar"],
    [Date.UTC(2026,7,28,4,14,4), "LUN PARTIAL", "lunar"],
    [Date.UTC(2027,1,6,16,0,48), "SOL ANNULAR", "solar"],
    [Date.UTC(2027,1,20,23,14,6), "LUN PENUMBRAL", "lunar"],
    [Date.UTC(2027,6,18,16,4,9), "LUN PENUMBRAL", "lunar"],
    [Date.UTC(2027,7,2,10,7,50), "SOL TOTAL", "solar"],
    [Date.UTC(2027,7,17,7,14,59), "LUN PENUMBRAL", "lunar"],
    [Date.UTC(2028,0,12,4,14,13), "LUN PARTIAL", "lunar"],
    [Date.UTC(2028,0,26,15,8,59), "SOL ANNULAR", "solar"],
    [Date.UTC(2028,6,6,18,20,57), "LUN PARTIAL", "lunar"],
    [Date.UTC(2028,6,22,2,56,40), "SOL TOTAL", "solar"],
    [Date.UTC(2028,11,31,16,53,15), "LUN TOTAL", "lunar"],
    [Date.UTC(2029,0,14,17,13,48), "SOL PARTIAL", "solar"],
    [Date.UTC(2029,5,12,4,6,13), "SOL PARTIAL", "solar"],
    [Date.UTC(2029,5,26,3,23,22), "LUN TOTAL", "lunar"],
    [Date.UTC(2029,6,11,15,37,19), "SOL PARTIAL", "solar"],
    [Date.UTC(2029,11,5,15,3,57), "SOL PARTIAL", "solar"],
    [Date.UTC(2029,11,20,22,43,12), "LUN TOTAL", "lunar"],
    [Date.UTC(2030,5,1,6,29,13), "SOL ANNULAR", "solar"],
    [Date.UTC(2030,5,15,18,34,34), "LUN PARTIAL", "lunar"],
    [Date.UTC(2030,10,25,6,51,37), "SOL TOTAL", "solar"],
    [Date.UTC(2030,11,9,22,28,51), "LUN PENUMBRAL", "lunar"]
  ];

  // NAOJ Mid-Autumn Moon dates. There is no unique astronomical instant;
  // Orbit uses 20:00 in the watch's local time as a viewing snapshot.
  var midAutumn = {
    2026: [8,25], 2027: [8,15], 2028: [9,3], 2029: [8,22], 2030: [8,12],
    2031: [9,1], 2032: [8,19], 2033: [8,8], 2034: [8,27], 2035: [8,16],
    2036: [9,4], 2037: [8,24], 2038: [8,13], 2039: [9,2], 2040: [8,21],
    2041: [8,10], 2042: [8,28], 2043: [8,17], 2044: [9,5], 2045: [8,25],
    2046: [8,15], 2047: [9,4], 2048: [8,22], 2049: [8,11], 2050: [8,30]
  };

  function approxEclipseKind(t, phaseIdx) {
    var m = moonGeo(new Date(t));
    var latDeg = Math.abs(m.lat / RAD);
    if (phaseIdx === 0 && latDeg < 1.55) return "SOL ECLIPSE";
    if (phaseIdx === 2 && latDeg < 1.75) return "LUN ECLIPSE";
    return null;
  }

  function generateEvents() {
    var start = Date.now();
    var endDate = new Date(start);
    endDate.setFullYear(endDate.getFullYear() + 1);
    var end = endDate.getTime();
    var qms = SYNODIC * DAY / 4;
    var k0 = Math.floor((start - PHASE_ANCHOR) / qms) - 2;
    var names = ["NEW MOON", "FIRST QUARTER", "FULL MOON", "LAST QUARTER"];
    var tmp = [];
    var k, idx, t, label;

    for (k = k0; k < k0 + 64; k++) {
      idx = ((k % 4) + 4) % 4;
      t = refinePhase(PHASE_ANCHOR + k * qms, idx * PI / 2);
      if (t < start || t > end) continue;
      label = approxEclipseKind(t, idx) || names[idx];
      tmp.push({ t: t, label: label, kind: "phase", phase: idx });
    }

    // Replace nearby calculated new/full moon points with exact eclipse maxima.
    eclipseTable.forEach(function (e) {
      if (e[0] < start || e[0] > end) return;
      tmp = tmp.filter(function (x) {
        return !(x.kind === "phase" && (x.phase === 0 || x.phase === 2) && Math.abs(x.t - e[0]) < 20 * 3600000);
      });
      tmp.push({ t: e[0], label: e[1], kind: e[2] });
    });

    var y0 = new Date(start).getFullYear();
    var y1 = new Date(end).getFullYear();
    for (var y = y0; y <= y1; y++) {
      var md = midAutumn[y];
      if (!md) continue;
      var d = new Date(y, md[0], md[1], 20, 0, 0, 0);
      t = d.getTime();
      if (t >= start && t <= end) tmp.push({ t: t, label: "MID-AUTUMN", kind: "culture" });
    }

    tmp.sort(function (a, b) { return a.t - b.t; });
    events = tmp;
    if (sliderIndex > events.length) sliderIndex = events.length;
  }

  function loadFallbackLocation() {
    var ml;
    if (settings.locationMode === 2) {
      loc.lat = settings.manualLat;
      loc.lon = settings.manualLon;
      loc.source = "MAN";
      return;
    }
    if (settings.locationMode === 1) {
      ml = Storage.readJSON("mylocation.json", 1);
      if (ml && isFinite(ml.lat) && isFinite(ml.lon)) {
        loc.lat = ml.lat; loc.lon = ml.lon; loc.source = "MYLOC";
      }
      return;
    }
    if (isFinite(settings.lastLat) && isFinite(settings.lastLon)) {
      loc.lat = settings.lastLat; loc.lon = settings.lastLon; loc.source = "GPS";
      return;
    }
    ml = Storage.readJSON("mylocation.json", 1);
    if (ml && isFinite(ml.lat) && isFinite(ml.lon)) {
      loc.lat = ml.lat; loc.lon = ml.lon; loc.source = "MYLOC";
    }
  }

  function stopGPS() {
    if (gpsTimer) { clearTimeout(gpsTimer); gpsTimer = undefined; }
    if (gpsActive) {
      gpsActive = false;
      Bangle.setGPSPower(0, "orbit");
    }
  }

  function onGPS(fix) {
    if (!fix || !fix.fix || !isFinite(fix.lat) || !isFinite(fix.lon)) return;
    loc.lat = fix.lat;
    loc.lon = fix.lon;
    loc.source = "GPS";
    settings.lastLat = fix.lat;
    settings.lastLon = fix.lon;
    settings.lastFix = Date.now();
    Storage.writeJSON(FILE, settings);
    stopGPS();
    draw();
  }

  function startGPS() {
    if (settings.locationMode !== 0 || gpsActive) return;
    gpsActive = true;
    Bangle.setGPSPower(1, "orbit");
    gpsTimer = setTimeout(function () {
      stopGPS();
      draw();
    }, clamp(settings.gpsTimeout, 10, 90) * 1000);
  }

  function gmst(date) {
    var jd = date.valueOf() / DAY + 2440587.5;
    var T = (jd - 2451545.0) / 36525;
    var deg = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
      0.000387933 * T * T - T * T * T / 38710000;
    return norm(deg * RAD);
  }

  function fmt2(n) { return ("0" + n).substr(-2); }
  function formatDate(date) {
    return date.getFullYear() + "/" + fmt2(date.getMonth() + 1) + "/" + fmt2(date.getDate()) +
      " " + fmt2(date.getHours()) + ":" + fmt2(date.getMinutes());
  }

  function sceneDate() {
    if (!sliderIndex) return new Date();
    return new Date(events[sliderIndex - 1].t);
  }

  function currentLabel() {
    if (!sliderIndex) return gpsActive ? "NOW  GPS..." : "NOW";
    return events[sliderIndex - 1].label;
  }

  function drawHeader(date) {
    var eventMode = sliderIndex > 0;
    g.setColor(eventMode ? C.fg : C.bg).fillRect(0, 0, W - 1, 17);
    g.setColor(eventMode ? C.bg : C.fg);
    g.setFont("6x8", 1).setFontAlign(-1, 0).drawString(formatDate(date), 2, 8);
    g.setFontAlign(1, 0).drawString("B" + E.getBattery() + "%", W - 2, 8);
  }

  function drawSun(x, y, r) {
    var i, a, r1, r2;
    g.setColor(C.flare);
    for (i = 0; i < 10; i++) {
      a = i * TAU / 10;
      r1 = r + 1;
      r2 = r + 3 + (i % 3);
      g.drawLine(Math.round(x + Math.cos(a) * r1), Math.round(y + Math.sin(a) * r1),
                 Math.round(x + Math.cos(a) * r2), Math.round(y + Math.sin(a) * r2));
    }
    g.setColor(C.sun).fillCircle(x, y, r);
    g.setColor(C.flare).fillCircle(x - Math.round(r / 3), y - Math.round(r / 3), Math.max(1, Math.round(r / 4)));
  }

  function drawEarth(x, y, r, date) {
    g.setColor(C.earth).fillCircle(x, y, r);
    g.setColor(C.earthEdge).drawCircle(x, y, r);
    g.setColor("#fff").setPixel(x - Math.round(r / 3), y - Math.round(r / 3));

    if (!isFinite(loc.lat) || !isFinite(loc.lon)) return;
    var lat = loc.lat * RAD;
    var theta = gmst(date) + loc.lon * RAD;
    var d = r * Math.cos(lat);
    var ux = Math.cos(theta), uy = -Math.sin(theta);
    var px = x + d * ux, py = y + d * uy;
    var half = Math.sqrt(Math.max(0, r * r - d * d));
    var vx = -uy, vy = ux;

    g.setColor(C.horizon);
    g.drawLine(Math.round(px - half * vx), Math.round(py - half * vy),
               Math.round(px + half * vx), Math.round(py + half * vy));
    g.setColor(C.marker).fillCircle(Math.round(px), Math.round(py), settings.markerSize);
  }

  function shadowGeometry(date, moonR) {
    var m = moonGeo(date);
    var s = sunLon(date);
    var dx = wrapPi(m.lon - norm(s + PI));
    var dy = m.lat;
    var moonAng = Math.asin(1737.4 / m.dist);
    var ru = 6378.1 - m.dist * (696340 - 6378.1) / 149597870;
    var rp = 6378.1 + m.dist * (696340 + 6378.1) / 149597870;
    return {
      ox: -dx / moonAng * moonR,
      oy: dy / moonAng * moonR,
      ur: Math.max(0, Math.atan(ru / m.dist) / moonAng * moonR),
      pr: Math.atan(rp / m.dist) / moonAng * moonR
    };
  }

  function drawMoon(mx, my, r, sx, sy, date) {
    var ux = sx - mx, uy = sy - my;
    var len = Math.sqrt(ux * ux + uy * uy) || 1;
    ux /= len; uy /= len;

    g.setColor(C.bg).fillCircle(mx, my, r);
    g.setColor(C.moon);
    var yy, xx, xmax;
    for (yy = -r; yy <= r; yy++) {
      xmax = Math.floor(Math.sqrt(Math.max(0, r * r - yy * yy)));
      for (xx = -xmax; xx <= xmax; xx++) {
        if (xx * ux + yy * uy >= 0) g.setPixel(mx + xx, my + yy);
      }
    }

    // Earth shadow, continuously applied when the Moon approaches opposition.
    var sh = shadowGeometry(date, r);
    var shx = sh.ox, shy = sh.oy;
    for (yy = -r; yy <= r; yy++) {
      xmax = Math.floor(Math.sqrt(Math.max(0, r * r - yy * yy)));
      for (xx = -xmax; xx <= xmax; xx++) {
        var dsq = (xx - shx) * (xx - shx) + (yy - shy) * (yy - shy);
        if (dsq <= sh.ur * sh.ur) {
          g.setColor(C.bg).setPixel(mx + xx, my + yy);
        } else if (dsq <= sh.pr * sh.pr) {
          // Penumbra: keep it visibly dimmer without pretending it is full umbra.
          g.setColor(C.penumbra).setPixel(mx + xx, my + yy);
        }
      }
    }
    g.setColor(C.moon).drawCircle(mx, my, r);
  }

  function drawSlider() {
    var n = events.length;
    var frac = n ? sliderIndex / n : 0;
    var x = Math.round(SLIDER_X0 + frac * (SLIDER_X1 - SLIDER_X0));
    g.setColor(C.slider).drawLine(SLIDER_X0, SLIDER_Y, SLIDER_X1, SLIDER_Y);
    g.drawLine(SLIDER_X0, SLIDER_Y - 3, SLIDER_X0, SLIDER_Y + 3);
    g.drawLine(SLIDER_X1, SLIDER_Y - 3, SLIDER_X1, SLIDER_Y + 3);
    g.setColor(sliderIndex ? C.moon : C.fg).fillCircle(x, SLIDER_Y, 4);
  }

  function draw() {
    var date = sceneDate();
    var sLon = sunLon(date);
    var eLon = norm(sLon + PI);
    var m = moonGeo(date);
    var ex = Math.round(CX + EARTH_ORBIT_R * Math.cos(eLon));
    var ey = Math.round(CY - EARTH_ORBIT_R * Math.sin(eLon));
    var mx = Math.round(ex + MOON_ORBIT_R * Math.cos(m.lon));
    var my = Math.round(ey - MOON_ORBIT_R * Math.sin(m.lon));

    g.setBgColor(C.bg).setColor(C.bg).clear();
    drawHeader(date);
    g.setFont("6x8", 1).setFontAlign(0, -1).setColor(sliderIndex ? C.moon : C.fg)
      .drawString(currentLabel(), CX, 20);

    g.setColor(C.orbit).drawCircle(CX, CY, EARTH_ORBIT_R);
    g.drawCircle(ex, ey, MOON_ORBIT_R);

    drawSun(CX, CY, settings.sunSize);
    drawEarth(ex, ey, settings.earthSize, date);
    drawMoon(mx, my, settings.moonSize, CX, CY, date);
    drawSlider();
  }

  function setSliderFromX(x) {
    var n = events.length;
    if (!n) { sliderIndex = 0; draw(); return; }
    var frac = clamp((x - SLIDER_X0) / (SLIDER_X1 - SLIDER_X0), 0, 1);
    var idx = Math.round(frac * n);
    if (idx !== sliderIndex) {
      sliderIndex = idx;
      draw();
    }
  }

  function onDrag(e) {
    if (e.b && (dragActive || e.y >= H - 30)) {
      dragActive = true;
      setSliderFromX(e.x);
    } else if (!e.b) {
      dragActive = false;
    }
  }

  function onTouch(zone, e) {
    if (e && e.y >= H - 30) setSliderFromX(e.x);
  }

  function queueDraw() {
    if (drawTimer) clearTimeout(drawTimer);
    var step = 5 * 60000;
    var wait = step - (Date.now() % step) + 20;
    drawTimer = setTimeout(function () {
      drawTimer = undefined;
      draw();
      queueDraw();
    }, wait);
  }

  function onLCD(on) {
    if (on) { draw(); queueDraw(); }
    else if (drawTimer) { clearTimeout(drawTimer); drawTimer = undefined; }
  }

  function cleanup() {
    if (drawTimer) clearTimeout(drawTimer);
    if (gpsTimer) clearTimeout(gpsTimer);
    stopGPS();
    Bangle.removeListener("GPS", onGPS);
    Bangle.removeListener("lcdPower", onLCD);
  }

  generateEvents();
  loadFallbackLocation();
  Bangle.on("GPS", onGPS);
  Bangle.on("lcdPower", onLCD);
  Bangle.setUI({
    mode: "custom",
    btn: Bangle.showLauncher,
    drag: onDrag,
    touch: onTouch,
    remove: cleanup
  });

  draw();
  queueDraw();
  startGPS();
})();
