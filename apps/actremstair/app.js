(function () {
  var activityreminder = require("actremstair");
  var settings = activityreminder.loadSettings();
  var data = activityreminder.loadData();
  var W = g.getWidth();

  function getHoursMins(date) {
    var h = date.getHours();
    var m = date.getMinutes();
    return ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2);
  }

  function rawDelta(a, b) {
    return b >= a ? b - a : b;
  }

  function drawData(name, value, y) {
    g.setFontAlign(-1, -1).drawString(name, 8, y);
    g.setFontAlign(1, -1).drawString(value, W - 8, y);
  }

  function drawInfo() {
    settings = activityreminder.loadSettings();
    var health = Bangle.getHealthStatus("day");
    var raw = rawDelta(data.stepsOnDate, health.steps);
    var effective = Math.max(0, raw + data.stairCorrection);
    var eqPerM = activityreminder.getStairStepPerMeter(settings);
    var h = 15;
    var y = 27;

    g.setColor(g.theme.fg);
    g.setFont("Vector", h);
    g.setFontAlign(-1, -1);

    g.drawString("Current Cycle", 8, y);
    y += 20;
    drawData("Start", getHoursMins(data.stepsDate), y); y += 18;
    drawData("Activity eq", Math.round(effective) + "/" + settings.minSteps, y); y += 18;
    drawData("Raw steps", raw, y); y += 18;
    drawData("Stair rise", data.stairHeightCycle.toFixed(1) + "m", y); y += 18;
    drawData("Today stairs", data.stairHeightDay.toFixed(1) + "m", y); y += 18;
    drawData("Eq/m", eqPerM.toFixed(1), y);

    g.setFont("6x8", 1).setFontAlign(0, 1);
    g.drawString("Stair ascent replaces its raw steps", W / 2, g.getHeight() - 3);
  }

  function run() {
    g.clear();
    Bangle.loadWidgets();
    Bangle.drawWidgets();
    drawInfo();
    Bangle.setUI({ mode: "custom", back: load, redraw: run });
  }

  run();
})();
