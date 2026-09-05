(function () {
  var AR = require("actremplus");
  var S = AR.loadSettings();
  var D = AR.loadData(S);
  var W = g.getWidth();

  function hhmm(ms) {
    var d = new Date(ms || Date.now());
    return ("0" + d.getHours()).substr(-2) + ":" + ("0" + d.getMinutes()).substr(-2);
  }

  function line(name, value, y) {
    g.setFont("6x8", 2).setFontAlign(-1, -1);
    g.drawString(name, 8, y);
    g.setFontAlign(1, -1);
    g.drawString(value, W - 8, y);
  }

  function draw() {
    g.reset().clear();
    Bangle.loadWidgets();
    Bangle.drawWidgets();

    var y = 30;
    g.setColor(g.theme.fg).setFont("Vector", 22).setFontAlign(0, -1);
    g.drawString("Activity Reminder+", W / 2, y);
    y += 32;

    if (S.mode === "steps") {
      var health = Bangle.getHealthStatus("day");
      var steps = health.steps - D.stepsOnDate;
      line("Mode", "Steps", y); y += 24;
      line("Cycle", steps + "/" + S.minSteps, y); y += 24;
      line("Since", hhmm(D.stepsDateMs), y); y += 24;
    } else {
      var targetNow = AR.targetByNow(new Date(), S);
      line("Mode", "Stairs", y); y += 24;
      line("Climb", D.climbM.toFixed(1) + "m", y); y += 24;
      line("Now target", targetNow.toFixed(0) + "m", y); y += 24;
      line("Day target", S.stairDailyTargetM + "m", y); y += 24;
      line("Sessions", "" + D.climbSessions, y); y += 24;
    }

    g.setFont("6x8", 1).setFontAlign(0, 1);
    g.drawString("BTN: back", W / 2, g.getHeight() - 4);
  }

  draw();
  Bangle.setUI({mode:"custom", back:load, redraw:draw});
})();
