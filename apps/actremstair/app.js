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
    var health = Bangle.getHealthStatus("day");
    var raw = rawDelta(data.stepsOnDate, health.steps);
    var effective = Math.max(0, raw + data.stairCorrection);
    var h = 16;
    var y = 28;

    g.setColor(g.theme.fg);
    g.setFont("Vector", h);
    g.setFontAlign(-1, -1);

    g.drawString("Current Cycle", 8, y);
    y += 22;
    drawData("Start", getHoursMins(data.stepsDate), y); y += 20;
    drawData("Activity eq", Math.round(effective) + "/" + settings.minSteps, y); y += 20;
    drawData("Raw steps", raw, y); y += 20;
    drawData("Stair rise", data.stairHeightCycle.toFixed(1) + "m", y); y += 20;
    drawData("Today stairs", data.stairHeightDay.toFixed(1) + "m", y);

    g.setFont("6x8", 1).setFontAlign(0, 1);
    g.drawString("Stairs replace their raw steps", W / 2, g.getHeight() - 3);
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
