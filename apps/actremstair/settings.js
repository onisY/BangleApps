(function (back) {
  var activityreminder = require("actremstair");
  var settings = activityreminder.loadSettings();

  function save() {
    activityreminder.writeSettings(settings);
  }

  var menu = {
    "": { title: "Activity Reminder +stair" },
    "< Back": back,
    "Enable": {
      value: settings.enabled,
      onchange: function (v) { settings.enabled = v; save(); }
    },
    "Start hour": {
      value: settings.startHour,
      min: 0, max: 24,
      onchange: function (v) { settings.startHour = v; save(); }
    },
    "End hour": {
      value: settings.endHour,
      min: 0, max: 24,
      onchange: function (v) { settings.endHour = v; save(); }
    },
    "Max inactivity": {
      value: settings.maxInnactivityMin,
      min: 15, max: 120,
      format: function (v) { return v + "m"; },
      onchange: function (v) { settings.maxInnactivityMin = v; save(); }
    },
    "Dismiss delay": {
      value: settings.dismissDelayMin,
      min: 5, max: 60,
      format: function (v) { return v + "m"; },
      onchange: function (v) { settings.dismissDelayMin = v; save(); }
    },
    "Pause delay": {
      value: settings.pauseDelayMin,
      min: 30, max: 240, step: 5,
      format: function (v) { return v + "m"; },
      onchange: function (v) { settings.pauseDelayMin = v; save(); }
    },
    "Min activity eq": {
      value: settings.minSteps,
      min: 10, max: 500, step: 10,
      onchange: function (v) { settings.minSteps = v; save(); }
    },
    "Stair eq step/m": {
      value: settings.stairStepPerMeter,
      min: 10, max: 60, step: 0.5,
      format: function (v) { return v.toFixed(1); },
      onchange: function (v) { settings.stairStepPerMeter = v; save(); }
    },
    "Min stair rise": {
      value: settings.stairMinRiseM,
      min: 1.0, max: 3.0, step: 0.1,
      format: function (v) { return v.toFixed(1) + "m"; },
      onchange: function (v) { settings.stairMinRiseM = v; save(); }
    },
    "Temp Threshold": {
      value: settings.tempThreshold,
      min: 20, max: 40, step: 0.5,
      format: function (v) { return v + "°C"; },
      onchange: function (v) { settings.tempThreshold = v; save(); }
    },
    "Unlock on alarm": {
      value: !!settings.unlock,
      onchange: function (v) { settings.unlock = v; save(); }
    }
  };

  E.showMenu(menu);
})
