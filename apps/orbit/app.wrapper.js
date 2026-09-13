/* Orbit runtime wrapper v0.36
 * - Disables touch/drag handlers in Orbit (tap/double-tap/long-tap time navigation)
 * - Keeps swipe screenshots
 * - Replaces Orbit's normal single-button destination with 5wCal
 * - Leaves Orbit's double-click BLE reset logic unchanged
 */
(function(){
  var Storage=require("Storage");
  var originalOn=Bangle.on;
  var originalLauncher=Bangle.showLauncher;

  function open5wCal(){
    if(Storage.read("fivewcal.app.js")!==undefined){
      load("fivewcal.app.js");
      return;
    }
    /* Fallback for watches where 5wCal was installed independently. */
    var infos=Storage.list(/\.info$/);
    for(var i=0;i<infos.length;i++){
      var info=Storage.readJSON(infos[i],1);
      if(!info) continue;
      var id=(info.id||"").toLowerCase();
      var name=(info.name||"").toLowerCase();
      var shortName=(info.shortName||"").toLowerCase();
      if(id==="fivewcal" || id==="5wcal" || name==="5wcal" || shortName==="5wcal"){
        if(info.src){ load(info.src); return; }
      }
    }
    if(originalLauncher) originalLauncher();
  }

  /* Orbit v0.35 uses Bangle.showLauncher() only for the confirmed
     single side-button click. Redirect that destination to 5wCal. */
  Bangle.showLauncher=open5wCal;

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
