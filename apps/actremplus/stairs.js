exports.start = function (S, D, save, resetDay) {
  var APPID = "actremplus";
  var baroOn = false;
  var pressureTimer;
  var baroStopTimer;
  var lastMotionMs = 0;
  var lastPressureMs = 0;
  var lastAlt;
  var altBuf = [];
  var lowAlt;
  var highAlt;

  function median3(a) {
    if (a.length < 3) return undefined;
    var x=a[0], y=a[1], z=a[2], t;
    if (x>y) {t=x;x=y;y=t;}
    if (y>z) {t=y;y=z;z=t;}
    if (x>y) {t=x;x=y;y=t;}
    return y;
  }

  function commitRise(m) {
    if (m < S.stairMinSessionM) return;
    resetDay(new Date());
    D.climbM += m;
    D.climbLastMs = Date.now();
    D.climbSessions++;
    save();
  }

  function finishRise() {
    if (lowAlt !== undefined && highAlt !== undefined) {
      var rise = highAlt - lowAlt;
      if (rise >= S.stairMinSessionM) commitRise(rise);
    }
    lowAlt = undefined;
    highAlt = undefined;
    lastAlt = undefined;
    altBuf = [];
  }

  function processAltitude(alt) {
    var nowMs = Date.now();
    if (nowMs - lastMotionMs > 3500) return;

    altBuf.push(alt);
    if (altBuf.length > 3) altBuf.shift();
    var f = median3(altBuf);
    if (f === undefined) return;

    if (lastAlt !== undefined) {
      var dt = (nowMs - lastPressureMs) / 1000;
      if (dt > 0 && Math.abs(f - lastAlt) / dt > S.stairMaxSpeedMps) {
        // Likely elevator or abrupt pressure jump.
        lowAlt = f;
        highAlt = f;
        lastAlt = f;
        lastPressureMs = nowMs;
        return;
      }
    }

    lastPressureMs = nowMs;
    lastAlt = f;

    if (lowAlt === undefined) {
      lowAlt = f;
      highAlt = f;
      return;
    }

    if (f < lowAlt) {
      lowAlt = f;
      highAlt = f;
      return;
    }

    if (f > highAlt) highAlt = f;

    // A clear descent closes the preceding ascent segment.
    if (highAlt - lowAlt >= S.stairMinSessionM && highAlt - f >= 0.8) {
      commitRise(highAlt - lowAlt);
      lowAlt = f;
      highAlt = f;
    }
  }

  function stop(commit) {
    if (!baroOn) return;
    if (pressureTimer) { clearTimeout(pressureTimer); pressureTimer = undefined; }
    if (baroStopTimer) { clearInterval(baroStopTimer); baroStopTimer = undefined; }
    if (commit) finishRise();
    baroOn = false;
    Bangle.setBarometerPower(false, APPID);
  }

  function sample() {
    pressureTimer = undefined;
    if (!baroOn) return;
    if (Date.now() - lastMotionMs > S.motionHoldSec * 1000) {
      stop(true);
      return;
    }

    var p = Bangle.getPressure();
    if (!p || !p.then) { stop(true); return; }

    p.then(function (e) {
      if (baroOn && e && isFinite(e.altitude)) processAltitude(e.altitude);
      if (baroOn) pressureTimer = setTimeout(sample, S.pressureSampleSec * 1000);
    }, function () {
      if (baroOn) pressureTimer = setTimeout(sample, S.pressureSampleSec * 1000);
    });
  }

  function startBarometer() {
    if (baroOn) return;
    baroOn = true;
    altBuf = [];
    lowAlt = highAlt = lastAlt = undefined;
    lastPressureMs = 0;
    Bangle.setBarometerPower(true, APPID);
    pressureTimer = setTimeout(sample, 100);
    baroStopTimer = setInterval(function () {
      if (baroOn && Date.now() - lastMotionMs > S.motionHoldSec * 1000) stop(true);
    }, 3000);
  }

  function onStep() {
    var AR = require("actremplus");
    var now = new Date();
    if (!S.enabled || !AR.isDuringHours(now, S) || Bangle.isCharging()) return;
    lastMotionMs = Date.now();
    if (!baroOn) startBarometer();
  }

  Bangle.on("step", onStep);

  return {
    stop: stop,
    remove: function () {
      stop(true);
      Bangle.removeListener("step", onStep);
    },
    isOn: function () { return baroOn; }
  };
};
