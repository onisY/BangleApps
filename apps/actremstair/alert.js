(function () {
  var activityreminder = require("actremstair");
  var storage = require("Storage");
  var data = activityreminder.loadData();

  E.showPrompt("Inactivity detected", {
    title: "Activity Reminder +stair",
    buttons: { "Ok": 1, "Dismiss": 2, "Pause": 3 }
  }).then(function (v) {
    if (v == 1) data.okDate = new Date();
    if (v == 2) data.dismissDate = new Date();
    if (v == 3) data.pauseDate = new Date();
    activityreminder.saveData(data);
    load();
  });

  if (!(storage.readJSON("setting.json", 1) || {}).quiet)
    Bangle.buzz(400);

  if ((storage.readJSON("actremstair.s.json", 1) || {}).unlock) {
    Bangle.setLocked(false);
    Bangle.setLCDPower(1);
  }

  setTimeout(load, 20000);

  g.clear();
  Bangle.loadWidgets();
  Bangle.drawWidgets();
})();
