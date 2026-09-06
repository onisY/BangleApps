(function (back) {
  var activityreminder = require("actremstair");
  var settings = activityreminder.loadSettings();

  function save() {
    activityreminder.writeSettings(settings);
  }

  function energyMenu() {
    return {
      "": { title: "Energy model" },
      "< Back": function () { E.showMenu(mainMenu()); },
      "Walking MET": {
        value: settings.walkMet,
        min: 1.5, max: 8.0, step: 0.1,
        format: function (v) { return v.toFixed(1); },
        onchange: function (v) { settings.walkMet = v; save(); }
      },
      "Stair MET": {
        value: settings.stairMet,
        min: 3.0, max: 15.0, step: 0.1,
        format: function (v) { return v.toFixed(1); },
        onchange: function (v) { settings.stairMet = v; save(); }
      },
      "Base eq step/m": {
        value: settings.stairBaseStepPerMeter,
        min: 10, max: 60, step: 0.5,
        format: function (v) { return v.toFixed(1); },
        onchange: function (v) { settings.stairBaseStepPerMeter = v; save(); }
      },
      "Current eq/m": function () {
        var eq = activityreminder.getStairStepPerMeter(settings);
        E.showAlert(eq.toFixed(1) + " eq steps/m", "Current conversion")
          .then(function () { E.showMenu(energyMenu()); });
      },
      "Reset MET defaults": function () {
        settings.walkMet = 3.8;
        settings.stairMet = 6.8;
        settings.stairBaseStepPerMeter = 28.6;
        settings.baseWalkMet = 3.8;
        settings.baseStairMet = 6.8;
        save();
        E.showMenu(energyMenu());
      }
    };
  }

  function mainMenu() {
    return {
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
      "Energy model": function () { E.showMenu(energyMenu()); },
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
  }

  E.showMenu(mainMenu());
})
