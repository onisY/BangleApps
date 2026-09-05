(function () {
  var AR = require("actremplus");
  var S = AR.loadSettings();
  var D = AR.loadData(S);
  var stairs;

  function save() { AR.saveData(D); }

  function resetActivityDayIfNeeded(now) {
    var key = AR.dayKey(now, S);
    if (D.climbDayKey !== key) {
      D.climbDayKey = key;
      D.climbM = 0;
      D.climbLastMs = Date.now();
      D.climbSessions = 0;
      save();
    }
  }

  function isNotWorn() {
    return Bangle.isCharging() || S.tempThreshold >= E.getTemperature();
  }

  function commonAlertAllowed(nowMs) {
    return (nowMs - D.okMs) / 60000 > 3 &&
      (nowMs - D.dismissMs) / 60000 > S.dismissDelayMin &&
      (nowMs - D.pauseMs) / 60000 > S.pauseDelayMin;
  }

  function stepModeRun() {
    var health = Bangle.getHealthStatus("day");
    if (health.steps - D.stepsOnDate >= S.minSteps || health.steps < D.stepsOnDate) {
      D.stepsOnDate = health.steps;
      D.stepsDateMs = Date.now();
      save();
    }
    if ((Date.now() - D.stepsDateMs) / 60000 > S.maxInactivityMin && commonAlertAllowed(Date.now()))
      load("actremplus.alert.js");
  }

  function stairsModeRun(now) {
    resetActivityDayIfNeeded(now);
    var behind = D.climbM + S.stairBehindToleranceM < AR.targetByNow(now, S);
    var inactive = (Date.now() - D.climbLastMs) / 60000 > S.maxInactivityMin;
    if (behind && inactive && commonAlertAllowed(Date.now())) {
      if (stairs) stairs.stop(true);
      load("actremplus.alert.js");
    }
  }

  function run() {
    if (!S.enabled) return;
    var now = new Date();
    resetActivityDayIfNeeded(now);
    if (isNotWorn() || !AR.isDuringHours(now, S)) return;
    if (S.mode === "steps") stepModeRun();
    else stairsModeRun(now);
  }

  function onMidnight() {
    resetActivityDayIfNeeded(new Date());
    if (S.mode === "steps") {
      D.stepsOnDate = Bangle.getHealthStatus("day").steps;
      save();
    }
  }

  if (D.firstLoad) { D.firstLoad = false; save(); }

  if (S.enabled) {
    // The stair module is loaded only in Stair mode, so Step mode does not
    // pay the RAM/event-listener cost of the barometer logic.
    if (S.mode === "stairs") stairs = require("actremplus.stairs").start(S, D, save, resetActivityDayIfNeeded);
    Bangle.on("midnight", onMidnight);
    setInterval(run, 60000);
    setTimeout(run, 5000);
  }
})();
