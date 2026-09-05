exports.loadSettings = function () {
  return Object.assign({
    enabled: true,
    mode: "stairs",          // "steps" or "stairs"
    startHour: 9,
    endHour: 20,
    maxInactivityMin: 30,
    dismissDelayMin: 15,
    pauseDelayMin: 120,
    minSteps: 50,
    tempThreshold: 27,
    unlock: false,

    // Stair mode
    stairDailyTargetM: 280,
    stairMinSessionM: 1.5,
    stairBehindToleranceM: 5,
    pressureSampleSec: 2,
    motionHoldSec: 12,
    stairMaxSpeedMps: 1.0
  }, require("Storage").readJSON("actremplus.s.json", 1) || {});
};

exports.writeSettings = function (settings) {
  require("Storage").writeJSON("actremplus.s.json", settings);
};

exports.dayKey = function (d, settings) {
  // If the activity window crosses midnight, the part after midnight
  // belongs to the previous activity day.
  var x = new Date(d.getTime());
  if (settings && settings.startHour >= settings.endHour && d.getHours() < settings.endHour) {
    x.setDate(x.getDate() - 1);
  }
  return x.getFullYear() + "-" + (x.getMonth() + 1) + "-" + x.getDate();
};

exports.isDuringHours = function (d, settings) {
  var h = d.getHours();
  if (settings.startHour < settings.endHour)
    return h >= settings.startHour && h < settings.endHour;
  return h >= settings.startHour || h < settings.endHour;
};

exports.targetByNow = function (d, settings) {
  if (!exports.isDuringHours(d, settings)) return 0;

  var cur = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  var start = settings.startHour * 60;
  var end = settings.endHour * 60;
  var duration, elapsed;

  if (settings.startHour < settings.endHour) {
    duration = end - start;
    elapsed = cur - start;
  } else {
    duration = (1440 - start) + end;
    elapsed = cur >= start ? cur - start : (1440 - start) + cur;
  }

  if (duration <= 0) return settings.stairDailyTargetM;
  var f = elapsed / duration;
  if (f < 0) f = 0;
  if (f > 1) f = 1;
  return settings.stairDailyTargetM * f;
};

exports.saveData = function (data) {
  require("Storage").writeJSON("actremplus.data.json", data);
};

exports.loadData = function (settings) {
  var now = new Date();
  var health = Bangle.getHealthStatus("day");
  var data = Object.assign({
    firstLoad: true,
    stepsDateMs: Date.now(),
    stepsOnDate: health.steps,
    okMs: 0,
    dismissMs: 0,
    pauseMs: 0,
    climbDayKey: exports.dayKey(now, settings),
    climbM: 0,
    climbLastMs: Date.now(),
    climbSessions: 0
  }, require("Storage").readJSON("actremplus.data.json", 1) || {});

  var key = exports.dayKey(now, settings);
  if (data.climbDayKey !== key) {
    data.climbDayKey = key;
    data.climbM = 0;
    data.climbLastMs = Date.now();
    data.climbSessions = 0;
  }
  return data;
};
