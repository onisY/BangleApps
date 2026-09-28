/*
 * BG Monitor - read-only runtime activity monitor for Bangle.js 2
 * v0.011
 */
(function () {
  var Storage = require("Storage");
  var VERSION = "0.011";
  var REFRESH_MS = 2000;
  var TICKS_PER_MS = 1048.576;
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
          else if (typeof cb === "string") name = clip(cb.replace(/\s+/g, " "), 14);
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

  function addChunked(pages, title, items, footer) {
    if (!items.length) {
      pages.push({title:title, items:[["None","-"]], footer:footer});
      return;
    }
    for (var i = 0; i < items.length; i += 3) {
      pages.push({
        title:title,
        items:items.slice(i, i + 3),
        footer:footer
      });
    }
  }

  function buildPages() {
    var pages = [];
    var mem = process.memory(false);
    var pct = Math.round(mem.usage * 100 / mem.total);
    var p = power();
    var ts = timers();
    var ls = listeners();
    var ln = 0;
    ls.forEach(function (x) { ln += x.c; });

    pages.push({
      title:"BG MONITOR",
      items:[
        ["RAM", pct + "%"],
        ["Power", p ? ((p.total / 1000).toFixed(p.total < 10000 ? 2 : 1) + "mA") : "n/a"],
        ["Timers", ts.length]
      ],
      footer:"tap/swipe pages"
    });

    pages.push({
      title:"OVERVIEW",
      items:[
        ["Watches", watches()],
        ["Listeners", ln],
        ["Version", VERSION]
      ],
      footer:"button exits"
    });

    var si = [];
    sensors().forEach(function (x) {
      var o = owners(x.k);
      si.push([x.n + " " + (x.on ? "ON" : "OFF"), o.length ? o.join(",") : "-"]);
    });
    addChunked(pages, "SENSORS", si, "value = owner ID");

    var ti = [];
    ts.forEach(function (t) {
      ti.push([
        t.type + " #" + t.id + " " + (t.ms === null ? "once" : fmtMs(t.ms)),
        t.cb
      ]);
    });
    addChunked(pages, "TIMERS", ti, "BG timer excluded");

    var ei = [];
    ls.forEach(function (x) {
      ei.push([x.n, x.c + (x.c === 1 ? " listener" : " listeners")]);
    });
    addChunked(pages, "EVENTS", ei, "Bangle listeners");

    var bi = [];
    bootFiles().forEach(function (x) {
      bi.push([x.replace(/\.boot\.js$/, ""), "loaded"]);
    });
    addChunked(pages, "BOOT FILES", bi, "not proof active");

    var pi = [];
    if (p && p.device) {
      var keys = Object.keys(p.device);
      keys.sort(function (a,b) { return p.device[b] - p.device[a]; });
      keys.forEach(function (k) {
        var v = p.device[k];
        pi.push([k, v >= 1000 ? ((v / 1000).toFixed(2) + "mA") : (Math.round(v) + "uA")]);
      });
      pi.push(["TOTAL", (p.total / 1000).toFixed(2) + "mA"]);
    } else {
      pi.push(["Power estimate", "n/a"]);
    }
    pi.push(["Modules", modules().length]);
    addChunked(pages, "POWER", pi, "firmware estimate");
    return pages;
  }

  function clear() {
    g.reset();
    g.clear();
  }

  function header(title, n, total) {
    g.setColor(g.theme.fg).setFont("6x8",2).setFontAlign(-1,-1);
    g.drawString(clip(title, 10), 4, 4);
    g.setFont("6x8",2).setFontAlign(1,-1);
    g.drawString((n + 1) + "/" + total, W - 4, 4);
    g.drawLine(4, 25, W - 5, 25);
  }

  function bigItem(y, label, value) {
    g.setColor(g.theme.fg).setFont("6x8",2).setFontAlign(-1,-1);
    g.drawString(clip(label, 14), 5, y);
    g.setFontAlign(1,-1);
    g.drawString(clip(value, 14), W - 5, y + 17);
  }

  function footer(s) {
    g.setColor(g.theme.fg).setFont("4x6",2).setFontAlign(0,1);
    g.drawString(clip(s, 21), W / 2, H - 1);
  }

  function draw(force) {
    var now = Date.now();
    if (!force && now - lastDraw < 250) return;
    lastDraw = now;

    var pages = buildPages();
    if (page >= pages.length) page = pages.length - 1;
    if (page < 0) page = 0;
    var x = pages[page];

    clear();
    header(x.title, page, pages.length);
    var y = 32;
    for (var i = 0; i < x.items.length && i < 3; i++) {
      bigItem(y, x.items[i][0], x.items[i][1]);
      y += 40;
    }
    footer(x.footer || "");
  }

  function move(d) {
    var n = buildPages().length;
    page = (page + d + n) % n;
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
