/* Orbit runtime wrapper v0.37
 * - Disables touch/drag handlers in Orbit (tap/double-tap/long-tap time navigation)
 * - Keeps swipe screenshots
 * - Redirects Orbit's confirmed single-button action to:
 *     1) optional 5wCal
 *     2) standard Calendar
 *     3) Settings
 * - 5wCal is optional: no formal dependency is required
 * - Leaves Orbit's double-click BLE reset logic unchanged
 */
(function(){
  var Storage=require("Storage");
  var originalOn=Bangle.on;
  var originalLauncher=Bangle.showLauncher;

  function appSource(id,direct){
    var info=Storage.readJSON(id+".info",1);
    if(info && info.src && Storage.read(info.src)!==undefined) return info.src;
    if(Storage.read(direct)!==undefined) return direct;
  }

  function openCalendarOrSettings(){
    var src=appSource("fivewcal","fivewcal.app.js") ||
            appSource("calendar","calendar.app.js") ||
            appSource("setting","setting.app.js");
    if(src){
      load(src);
      return;
    }
    /* Last-resort safety only: normally Settings always exists. */
    if(originalLauncher) originalLauncher();
  }

  /* Orbit core calls Bangle.showLauncher() only after a confirmed single
     side-button click. Redirect that destination without changing the
     double-click BLE reset code in the core. */
  Bangle.showLauncher=openCalendarOrSettings;

  /* Suppress registration of touch/drag handlers while Orbit core starts.
     This removes tap, double-tap and long-tap input and therefore all redraws
     caused by those gestures. Swipe remains enabled for screenshots. */
  Bangle.on=function(event,handler){
    if(event==="touch" || event==="drag") return Bangle;
    return originalOn.call(Bangle,event,handler);
  };

  try {
    var core=Storage.read("orbit.core.js");
    if(!core) throw new Error("orbit.core.js missing");
    eval(core);
  } finally {
    Bangle.on=originalOn;
  }
})();
