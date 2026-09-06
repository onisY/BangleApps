exports.loadSettings = function () {
  var stored = require("Storage").readJSON("actremstair.s.json", true) || {};

  // v0.01 migration: if the user changed the old direct steps/m value,
  // preserve it as the new base calibration value.
  if (stored.stairStepPerMeter !== undefined && stored.stairBaseStepPerMeter === undefined)
    stored.stairBaseStepPerMeter = stored.stairStepPerMeter;

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

    // Energy-equivalence model. 28.6 eq steps/m was the v0.01
    // calibration at Walking MET=3.8 and Stair MET=6.8.
    walkMet: 3.8,
    stairMet: 6.8,
    stairBaseStepPerMeter: 28.6,
    baseWalkMet: 3.8,
    baseStairMet: 6.8,

    // Stair classifier
    stairMinRiseM: 1.5,
    stairStartRiseM: 0.6,
    stairDescentCloseM: 0.8,
    stairSampleSec: 2,
    stairMotionHoldSec: 10,
    stairMaxSpeedMps: 1.0
  }, stored);
};

exports.getStairStepPerMeter = function (settings) {
  var walkMet = Math.max(0.1, settings.walkMet || 3.8);
  var stairMet = Math.max(0.1, settings.stairMet || 6.8);
  var baseWalkMet = Math.max(0.1, settings.baseWalkMet || 3.8);
  var baseStairMet = Math.max(0.1, settings.baseStairMet || 6.8);
  var base = settings.stairBaseStepPerMeter || settings.stairStepPerMeter || 28.6;

  // Preserve the original 28.6 steps/m calibration at the default METs,
  // then scale the conversion by the relative MET ratio.
  return base * (stairMet / baseStairMet) * (baseWalkMet / walkMet);
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
