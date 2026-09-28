/*
 * BG Monitor - read-only runtime activity monitor for Bangle.js 2
 * v0.010
 */
(function () {
  var Storage = require("Storage");
  var VERSION = "0.010";
  var REFRESH_MS = 2000;
  var TICKS_PER_MS = 1048.576;
  var PAGE_COUNT = 6;
  var page = 0;
  var refreshTimer;
  var lastDraw = 0;
  var W = g.getWidth(), H = g.getHeight();

  function root() {
    try { if (E.internal) return E.internal; } catch (e) {}
    try { return global["\xFF"] || {}; } catch (e2) {}
    return {};
  }

  function clip(s, n) {
    s = String(s === undefined ? "" : s);
    return s.length <= n ? s : s.substr(0, Math.max(0, n - 1)) + "~";
  }

  function fmtMs(ms) {
    if (!isFinite(ms)) return "?";
    if (ms < 1000) return Math.round(ms) + "ms";
    if (ms < 60000) return (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + "s";
    if (ms < 3600000) return (ms / 60000).toFixed(ms < 600000 ? 1 : 0) + "m";
    return (ms / 3600000).toFixed(1) + "h";
  }

  function owners(key) {
    var p = Bangle._PWR;
    if (!p || !p[key]) return [];
    try { return p[key].slice(); } catch (e) {}
    var a = [];
    try { p[key].forEach(function (x) { a.push(x); }); } catch (e2) {}
    return a;
  }

  function sensors() {
    return [
      {n:"GPS",  k:"GPS",     on:Bangle.isGPSOn ? Bangle.isGPSOn() : false},
      {n:"HRM",  k:"HRM",     on:Bangle.isHRMOn ? Bangle.isHRMOn() : false},
      {n:"COMP", k:"Compass", on:Bangle.isCompassOn ? Bangle.isCompassOn() : false},
      {n:"BARO", k:"Barom",   on:Bangle.isBarometerOn ? Bangle.isBarometerOn() : false}
    ];
  }

  function timers() {
    var t = root().timers || [];
    var a = [];
    try {
      t.forEach(function (x, id) {
        if (!x || id === refreshTimer) return;
        var intr = x.intr;
        if (intr === undefined) intr = x.interval;
        if (intr === undefined) intr = x.int;
        var cb = x.cb;
        if (cb === undefined) cb = x.callback;
        var name = "anonymous";
        try {
          if (cb && cb.name) name = cb.name;
          else if (typeof cb === "string") name = clip(cb.replace(/\s+/g, " "), 16);
          else if (cb) {
            var z = String(cb).replace(/\s+/g, " ");
            var m = z.match(/function\s+([^\s(]+)/);
            if (m) name = m[1];
          }
        } catch (e) {}
        a.push({
          id:id,
          type:intr === undefined ? "TO" : "INT",
          ms:intr === undefined ? null : Number(intr) / TICKS_PER_MS,
          cb:name
        });
      });
    } catch (e2) {}
    return a;
  }

  function watches() {
    var w = root().watches || [];
    var n = 0;
    try { w.forEach(function (x) { if (x) n++; }); } catch (e) {}
    return n;
  }

  function listenerCount(obj, ev) {
    var v;
    try { v = obj["#on" + ev]; } catch (e) { return 0; }
    if (!v) return 0;
    if (typeof v.length === "number") return v.length;
    return 1;
  }

  function listeners() {
    var names = ["accel","pressure","GPS","HRM","mag","health","step","charging","lock","lcdPower","message"];
    var a = [];
    names.forEach(function (n) {
      var c = listenerCount(Bangle, n);
      if (c) a.push({n:n, c:c});
    });
    return a;
  }

  function bootFiles() {
    try { return Storage.list(/\.boot\.js$/) || []; } catch (e) {}
    return [];
  }

  function modules() {
    var m = root().modules || {};
    try { return Object.keys(m); } catch (e) {}
    return [];
  }

  function power() {
    try { if (E.getPowerUsage) return E.getPowerUsage(); } catch (e) {}
    return null;
  }

  function clear() {
    g.reset();
    g.clear();
  }

  function header(title, p) {
    g.setColor(g.theme.fg).setFont("6x8",2).setFontAlign(-1,-1);
    g.drawString(title, 4, 5);
    g.setFont("6x8").setFontAlign(1,-1);
    g.drawString((p + 1) + "/" + PAGE_COUNT, W - 4, 8);
    g.drawLine(4, 25, W - 5, 25);
  }

  function row(y, left, right, dim) {
    g.setFont("6x8").setFontAlign(-1,-1);
    g.setColor(dim ? (g.theme.dark ? "#aaa" : "#555") : g.theme.fg);
    g.drawString(clip(left, 17), 5, y);
    g.setFontAlign(1,-1);
    g.drawString(clip(right, 11), W - 5, y);
  }

  function footer(s) {
    g.setColor(g.theme.fg).setFont("4x6").setFontAlign(0,1);
    g.drawString(s, W / 2, H - 2);
  }

  function drawOverview() {
    clear(); header("BG MONITOR", 0);
    var mem = process.memory(false);
    var pct = Math.round(mem.usage * 100 / mem.total);
    var p = power();
    var ts = timers();
    var ls = listeners();
    var ln = 0;
    ls.forEach(function (x) { ln += x.c; });
    var y = 34;
    row(y, "Version", VERSION); y += 18;
    row(y, "RAM", pct + "%"); y += 18;
    row(y, "Power est.", p ? ((p.total / 1000).toFixed(p.total < 10000 ? 2 : 1) + "mA") : "n/a"); y += 18;
    row(y, "Timers", ts.length); y += 18;
    row(y, "Watches", watches()); y += 18;
    row(y, "Listeners", ln);
    footer("tap/swipe pages  button exit");
  }

  function drawSensors() {
    clear(); header("SENSORS", 1);
    var a = sensors(), y = 34;
    a.forEach(function (x) {
      var o = owners(x.k);
      row(y, x.n + " " + (x.on ? "ON" : "OFF"), o.length ? o.join(",") : "-");
      y += 27;
    });
    row(y, "BT connected", NRF.getSecurityStatus().connected ? "YES" : "NO");
    footer("right side = power owner ID");
  }

  function drawTimers() {
    clear(); header("TIMERS", 2);
    var a = timers(), y = 31;
    if (!a.length) row(y, "No app timers", "");
    for (var i = 0; i < a.length && i < 7; i++) {
      var t = a[i];
      row(y, t.type + " #" + t.id + " " + (t.ms === null ? "once" : fmtMs(t.ms)), t.cb);
      y += 18;
    }
    if (a.length > 7) row(y, "+" + (a.length - 7) + " more", "", true);
    footer("BG Monitor timer excluded");
  }

  function drawEvents() {
    clear(); header("EVENTS", 3);
    var a = listeners(), y = 34;
    if (!a.length) row(y, "No monitored", "listeners");
    for (var i = 0; i < a.length && i < 7; i++) {
      row(y, a[i].n, a[i].c + " listener" + (a[i].c === 1 ? "" : "s"));
      y += 18;
    }
    if (a.length > 7) row(y, "+" + (a.length - 7) + " events", "", true);
    footer("selected Bangle event listeners");
  }

  function drawBoot() {
    clear(); header("BOOT FILES", 4);
    var a = bootFiles(), y = 31;
    if (!a.length) row(y, "No .boot.js", "");
    for (var i = 0; i < a.length && i < 7; i++) {
      row(y, clip(a[i].replace(/\.boot\.js$/, ""), 24), "loaded");
      y += 18;
    }
    if (a.length > 7) row(y, "+" + (a.length - 7) + " more", "", true);
    footer("installed boot code; activity not proven");
  }

  function drawPower() {
    clear(); header("POWER / MODULES", 5);
    var p = power(), y = 31;
    if (p && p.device) {
      var keys = Object.keys(p.device);
      keys.sort(function (a,b) { return p.device[b] - p.device[a]; });
      for (var i = 0; i < keys.length && i < 5; i++) {
        var k = keys[i], v = p.device[k];
        row(y, k, v >= 1000 ? ((v / 1000).toFixed(2) + "mA") : (Math.round(v) + "uA"));
        y += 18;
      }
      row(y, "TOTAL", (p.total / 1000).toFixed(2) + "mA"); y += 18;
    } else {
      row(y, "Power estimate", "n/a"); y += 18;
    }
    var m = modules();
    row(y, "Modules", m.length);
    footer(m.length ? clip(m.join(","), 35) : "no cached modules");
  }

  function draw(force) {
    var now = Date.now();
    if (!force && now - lastDraw < 250) return;
    lastDraw = now;
    if (page === 0) drawOverview();
    else if (page === 1) drawSensors();
    else if (page === 2) drawTimers();
    else if (page === 3) drawEvents();
    else if (page === 4) drawBoot();
    else drawPower();
  }

  function move(d) {
    page = (page + d + PAGE_COUNT) % PAGE_COUNT;
    draw(true);
  }

  function cleanup() {
    if (refreshTimer !== undefined) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
  }

  Bangle.setUI({
    mode:"custom",
    touch:function () { move(1); },
    swipe:function (lr) { move(lr < 0 ? 1 : -1); },
    btn:function () { load(); },
    redraw:function () { draw(true); },
    remove:cleanup
  });

  refreshTimer = setInterval(function bgmonRefresh() {
    if (!Bangle.isLCDOn || Bangle.isLCDOn()) draw(false);
  }, REFRESH_MS);

  draw(true);
})();
