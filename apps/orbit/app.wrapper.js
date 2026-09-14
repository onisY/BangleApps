/* Orbit runtime wrapper v0.38 */
(function(){
  var Storage=require("Storage"), originalLauncher=Bangle.showLauncher;
  function appSource(id,direct){var info=Storage.readJSON(id+".info",1);if(info&&info.src&&Storage.read(info.src)!==undefined)return info.src;if(Storage.read(direct)!==undefined)return direct;}
  function openCalendarOrSettings(){var src=appSource("fivewcal","fivewcal.app.js")||appSource("calendar","calendar.app.js")||appSource("setting","setting.app.js");if(src){load(src);return;}if(originalLauncher)originalLauncher();}
  Bangle.showLauncher=openCalendarOrSettings;
  var core=Storage.read("orbit.core.js");if(!core)throw new Error("orbit.core.js missing");eval(core);
})();
