(function () {
  var activityreminder = require("actremstair");
  var settings = activityreminder.loadSettings();
  var data = activityreminder.loadData();
  var stairs;

  if (data.firstLoad) {
    data.firstLoad = false;
    activityreminder.saveData(data);
  }

  function saveData() {
    activityreminder.saveData(data);
  }

  function isNotWorn() {
    return Bangle.isCharging() || settings.tempThreshold >= E.getTemperature();
  }

  function isDuringAlertHours(h) {
    if (settings.startHour < settings.endHour)
      return h >= settings.startHour && h < settings.endHour;
    return h >= settings.startHour || h < settings.endHour;
  }

  function resetCycle(now, rawSteps) {
    if (stairs) stairs.closeForCycleReset(rawSteps);
    data.stepsOnDate = rawSteps;
    data.stepsDate = now;
    data.stairCorrection = 0;
    data.stairHeightCycle = 0;
    data.stairRawStepsCycle = 0;
    saveData();
  }

  function getEffectiveSteps(rawSteps) {
    if (!stairs) {
      if (rawSteps >= data.stepsOnDate) return rawSteps - data.stepsOnDate;
      return rawSteps;
    }
    return stairs.getEffectiveSteps(rawSteps, data.stepsOnDate);
  }

  function mustAlert(now) {
    if ((now - data.stepsDate) / 60000 > settings.maxInnactivityMin) {
      if ((now - data.okDate) / 60000 > 3 &&
          (now - data.dismissDate) / 60000 > settings.dismissDelayMin &&
          (now - data.pauseDate) / 60000 > settings.pauseDelayMin)
        return true;
    }
    return false;
  }

  function run() {
    if (isNotWorn()) return;

    var now = new Date();
    if (!isDuringAlertHours(now.getHours())) return;

    var health = Bangle.getHealthStatus("day");
    var rawSteps = health.steps;

    if (rawSteps < data.stepsOnDate) {
      data.stepsOnDate = rawSteps;
      data.stairCorrection = 0;
      data.stairHeightCycle = 0;
      data.stairRawStepsCycle = 0;
      saveData();
    }

    var effective = getEffectiveSteps(rawSteps);
    if (effective >= settings.minSteps) {
      resetCycle(now, rawSteps);
      return;
    }

    if (mustAlert(now))
      load("actremstair.alert.js");
  }

  function onMidnight() {
    var now = new Date();
    if (settings.enabled && isDuringAlertHours(now.getHours())) {
      data.stepsOnDate = 0;
      data.stairCorrection = 0;
      data.stairHeightCycle = 0;
      data.stairRawStepsCycle = 0;
      if (stairs) stairs.onMidnight();
      saveData();
    }
  }

  if (settings.enabled) {
    stairs = require("actremstair.stairs").start(
      settings,
      data,
      saveData,
      isDuringAlertHours,
      isNotWorn
    );

    Bangle.on("midnight", onMidnight);
    setInterval(run, 60000);
  }
})();
