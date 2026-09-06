exports.start = function (settings, data, saveData, isDuringAlertHours, isNotWorn) {
  var APPID = "actremstair";
  var baroOn = false;
  var sampleTimer;
  var stopTimer;
  var lastStepMs = 0;
  var altBuf = [];
  var stableAlt;
  var stableRaw;
  var candidate = false;
  var confirmed = false;
  var baseAlt;
  var highAlt;
  var startRaw;
  var highRaw;
  var lastAlt;
  var lastAltMs = 0;

  function rawDelta(a, b) {
    if (b >= a) return b - a;
    return b;
  }

  function getRawSteps() {
    return Bangle.getHealthStatus("day").steps;
  }

  function currentEqStepsPerMeter() {
    // Read current MET values from Storage so later changes in Settings
    // immediately affect new/live stair credit without requiring a reinstall.
    var AR = require("actremstair");
    return AR.getStairStepPerMeter(AR.loadSettings());
  }

  function median3(a) {
    if (a.length < 3) return undefined;
    var x = a[0], y = a[1], z = a[2], t;
    if (x > y) { t = x; x = y; y = t; }
    if (y > z) { t = y; y = z; z = t; }
    if (x > y) { t = x; x = y; y = t; }
    return y;
  }

  function resetCandidate(alt, raw) {
    candidate = false;
    confirmed = false;
    stableAlt = alt;
    stableRaw = raw;
    baseAlt = undefined;
    highAlt = undefined;
    startRaw = undefined;
    highRaw = undefined;
  }

  function addCommittedRise(rise, stairRaw) {
    if (rise < settings.stairMinRiseM) return;

    var equivalent = rise * currentEqStepsPerMeter();
    data.stairCorrection += equivalent - stairRaw;
    data.stairHeightCycle += rise;
    data.stairRawStepsCycle += stairRaw;

    var today = require("actremstair").dayKey(new Date());
    if (data.stairDay !== today) {
      data.stairDay = today;
      data.stairHeightDay = 0;
    }
    data.stairHeightDay += rise;
    saveData();
  }

  function commitCandidate() {
    if (!candidate || !confirmed || baseAlt === undefined || highAlt === undefined ||
        startRaw === undefined || highRaw === undefined)
      return false;

    var rise = highAlt - baseAlt;
    if (rise < settings.stairMinRiseM) return false;

    // Only replace steps recorded up to the highest point. Steps taken after
    // the top (descent or flat walking) remain ordinary walking steps.
    addCommittedRise(rise, rawDelta(startRaw, highRaw));
    return true;
  }

  function processAltitude(alt) {
    var nowMs = Date.now();
    var rawNow = getRawSteps();

    altBuf.push(alt);
    if (altBuf.length > 3) altBuf.shift();
    var f = median3(altBuf);
    if (f === undefined) return;

    if (lastAlt !== undefined && lastAltMs) {
      var dt = (nowMs - lastAltMs) / 1000;
      if (dt > 0 && Math.abs(f - lastAlt) / dt > settings.stairMaxSpeedMps) {
        resetCandidate(f, rawNow);
        lastAlt = f;
        lastAltMs = nowMs;
        return;
      }
    }

    lastAlt = f;
    lastAltMs = nowMs;

    if (stableAlt === undefined) {
      stableAlt = f;
      stableRaw = rawNow;
      return;
    }

    if (!candidate) {
      if (f - stableAlt >= settings.stairStartRiseM) {
        candidate = true;
        confirmed = false;
        baseAlt = stableAlt;
        highAlt = f;
        startRaw = stableRaw;
        highRaw = rawNow;
      } else {
        stableAlt = 0.75 * stableAlt + 0.25 * f;
        stableRaw = rawNow;
      }
      return;
    }

    if (f > highAlt) {
      highAlt = f;
      highRaw = rawNow;
    }

    if (!confirmed && highAlt - baseAlt >= settings.stairMinRiseM)
      confirmed = true;

    if (!confirmed && f <= baseAlt + 0.15) {
      resetCandidate(f, rawNow);
      return;
    }

    if (confirmed && highAlt - f >= settings.stairDescentCloseM) {
      commitCandidate();
      resetCandidate(f, rawNow);
    }
  }

  function stopBarometer(commit) {
    if (!baroOn) return;

    if (sampleTimer) {
      clearTimeout(sampleTimer);
      sampleTimer = undefined;
    }
    if (stopTimer) {
      clearInterval(stopTimer);
      stopTimer = undefined;
    }

    if (commit && confirmed)
      commitCandidate();

    baroOn = false;
    Bangle.setBarometerPower(false, APPID);

    altBuf = [];
    stableAlt = undefined;
    stableRaw = undefined;
    candidate = false;
    confirmed = false;
    baseAlt = undefined;
    highAlt = undefined;
    startRaw = undefined;
    highRaw = undefined;
    lastAlt = undefined;
    lastAltMs = 0;
  }

  function samplePressure() {
    sampleTimer = undefined;
    if (!baroOn) return;

    if (Date.now() - lastStepMs > settings.stairMotionHoldSec * 1000) {
      stopBarometer(true);
      return;
    }

    var p = Bangle.getPressure();
    if (!p || !p.then) {
      stopBarometer(false);
      return;
    }

    p.then(function (e) {
      if (baroOn && e && isFinite(e.altitude)) processAltitude(e.altitude);
      if (baroOn)
        sampleTimer = setTimeout(samplePressure, settings.stairSampleSec * 1000);
    }, function () {
      if (baroOn)
        sampleTimer = setTimeout(samplePressure, settings.stairSampleSec * 1000);
    });
  }

  function startBarometer() {
    if (baroOn) return;
    baroOn = true;
    Bangle.setBarometerPower(true, APPID);
    sampleTimer = setTimeout(samplePressure, 100);
    stopTimer = setInterval(function () {
      if (baroOn && Date.now() - lastStepMs > settings.stairMotionHoldSec * 1000)
        stopBarometer(true);
    }, 3000);
  }

  function onStep() {
    var now = new Date();
    if (!settings.enabled) return;
    if (!isDuringAlertHours(now.getHours())) return;
    if (isNotWorn()) return;

    lastStepMs = Date.now();
    if (!baroOn) startBarometer();
  }

  function getLiveCorrection() {
    if (!candidate || !confirmed || baseAlt === undefined || highAlt === undefined ||
        startRaw === undefined || highRaw === undefined)
      return 0;

    var rise = highAlt - baseAlt;
    var equivalent = rise * currentEqStepsPerMeter();
    return equivalent - rawDelta(startRaw, highRaw);
  }

  function getEffectiveSteps(rawNow, cycleRawStart) {
    var raw = rawDelta(cycleRawStart, rawNow);
    return raw + data.stairCorrection + getLiveCorrection();
  }

  function closeForCycleReset(rawNow) {
    if (candidate && confirmed)
      commitCandidate();

    if (lastAlt !== undefined) resetCandidate(lastAlt, rawNow);
    else resetCandidate(undefined, rawNow);
  }

  function onMidnight() {
    var rawNow = getRawSteps();
    data.stairCorrection = 0;
    data.stairHeightCycle = 0;
    data.stairRawStepsCycle = 0;
    data.stairDay = require("actremstair").dayKey(new Date());
    data.stairHeightDay = 0;
    saveData();
    resetCandidate(lastAlt, rawNow);
  }

  Bangle.on("step", onStep);

  return {
    getEffectiveSteps: getEffectiveSteps,
    closeForCycleReset: closeForCycleReset,
    onMidnight: onMidnight,
    stop: stopBarometer
  };
};
