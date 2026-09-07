(function (back) {
  var Storage = require("Storage");
  var FILE = "orbit.json";
  var defaults = {
    sunSize: 9,
    earthSize: 11,
    moonSize: 6,
    markerSize: 2,
    locationMode: 0,
    manualLat: 0,
    manualLon: 0,
    gpsTimeout: 30
  };
  var s = Storage.readJSON(FILE, 1) || {};
  Object.keys(defaults).forEach(function (k) {
    if (s[k] === undefined) s[k] = defaults[k];
  });
  function save() { Storage.writeJSON(FILE, s); }
  var locModes = ["Auto GPS", "My Location", "Manual"];

  E.showMenu({
    "": { title: "Orbit" },
    "< Back": back,
    "Location": {
      value: s.locationMode,
      min: 0, max: 2,
      format: function (v) { return locModes[v]; },
      onchange: function (v) { s.locationMode = v; save(); }
    },
    "Manual lat": {
      value: s.manualLat,
      min: -90, max: 90, step: 0.1,
      format: function (v) { return v.toFixed(1); },
      onchange: function (v) { s.manualLat = v; save(); }
    },
    "Manual lon": {
      value: s.manualLon,
      min: -180, max: 180, step: 0.1,
      format: function (v) { return v.toFixed(1); },
      onchange: function (v) { s.manualLon = v; save(); }
    },
    "GPS timeout": {
      value: s.gpsTimeout,
      min: 10, max: 90, step: 5,
      format: function (v) { return v + "s"; },
      onchange: function (v) { s.gpsTimeout = v; save(); }
    },
    "Sun size": {
      value: s.sunSize,
      min: 5, max: 15, step: 1,
      onchange: function (v) { s.sunSize = v; save(); }
    },
    "Earth size": {
      value: s.earthSize,
      min: 7, max: 16, step: 1,
      onchange: function (v) { s.earthSize = v; save(); }
    },
    "Moon size": {
      value: s.moonSize,
      min: 3, max: 9, step: 1,
      onchange: function (v) { s.moonSize = v; save(); }
    },
    "Marker size": {
      value: s.markerSize,
      min: 1, max: 4, step: 1,
      onchange: function (v) { s.markerSize = v; save(); }
    }
  });
})
