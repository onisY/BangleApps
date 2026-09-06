exports.loadSettings = function () {
  return Object.assign({
    enabled: true,
    startHour: 9,
    endHour: 20,
    maxInnactivityMin: 30,
    dismissDelayMin: 15,
    pauseDelayMin: 120,
    minSteps: 50,
    tempThreshold: 27,
    unlock: false,
    stairStepPerMeter: 28.6,
    stairMinRiseM: 1.5,
    stairStartRiseM: 0.6,
    stairDescentCloseM: 0.8,
    stairSampleSec: 2,
    stairMotionHoldSec: 10,
    stairMaxSpeedMps: 1.0
  }, require("Storage").readJSON("actremstair.s.json", true) || {});
};

exports.writeSettings = function (settings) {
  require("Storage").writeJSON("actremstair.s.json", settings);
};

exports.saveData = function (data) {
  require("Storage").writeJSON("actremstair.data.json", data);
};

exports.dayKey = function (d) {
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
};

exports.loadData = function () {
  var health = Bangle.getHealthStatus("day");
  var now = new Date();
  var data = Object.assign({
    firstLoad: true,
    stepsDate: now,
    stepsOnDate: health.steps,
    okDate: new Date(1970),
    dismissDate: new Date(1970),
    pauseDate: new Date(1970),
    stairCorrection: 0,
    stairHeightCycle: 0,
    stairRawStepsCycle: 0,
    stairDay: exports.dayKey(now),
    stairHeightDay: 0
  }, require("Storage").readJSON("actremstair.data.json") || {});

  data.stepsDate = new Date(typeof data.stepsDate === "string" ? data.stepsDate : data.stepsDate.ms);
  data.okDate = new Date(typeof data.okDate === "string" ? data.okDate : data.okDate.ms);
  data.dismissDate = new Date(typeof data.dismissDate === "string" ? data.dismissDate : data.dismissDate.ms);
  data.pauseDate = new Date(typeof data.pauseDate === "string" ? data.pauseDate : data.pauseDate.ms);

  if (data.stairDay !== exports.dayKey(now)) {
    data.stairDay = exports.dayKey(now);
    data.stairHeightDay = 0;
  }

  return data;
};
