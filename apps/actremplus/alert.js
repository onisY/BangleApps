(function () {
  var AR = require("actremplus");
  var Storage = require("Storage");
  var S = AR.loadSettings();
  var D = AR.loadData(S);
  var timer;

  var msg;
  if (S.mode === "steps") {
    msg = "Walking break needed";
  } else {
    var t = AR.targetByNow(new Date(), S);
    msg = "Stairs " + D.climbM.toFixed(0) + "/" + t.toFixed(0) + " m";
  }

  function finish(v) {
    if (timer) clearTimeout(timer);
    var now = Date.now();
    if (v === 1) D.okMs = now;
    if (v === 2) D.dismissMs = now;
    if (v === 3) D.pauseMs = now;
    AR.saveData(D);
    load();
  }

  g.clear();
  Bangle.loadWidgets();
  Bangle.drawWidgets();

  E.showPrompt(msg, {
    title:"Activity Reminder+",
    buttons:{"Ok":1,"Dismiss":2,"Pause":3}
  }).then(finish);

  if (!(Storage.readJSON("setting.json",1)||{}).quiet) Bangle.buzz(400);

  if (S.unlock) {
    Bangle.setLocked(false);
    Bangle.setLCDPower(1);
  }

  timer = setTimeout(function(){ load(); }, 20000);
})();
