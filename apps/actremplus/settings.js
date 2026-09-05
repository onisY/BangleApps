(function (back) {
  var AR = require("actremplus");
  var S = AR.loadSettings();

  function save() { AR.writeSettings(S); }

  function menu() {
    var m = {
      "": {title:"Activity Reminder+"},
      "< Back": back,
      "Enable": {
        value: !!S.enabled,
        onchange: function(v){ S.enabled=v; save(); }
      },
      "Mode": {
        value: S.mode === "stairs" ? 1 : 0,
        min:0, max:1, step:1,
        format:function(v){ return v ? "Stairs" : "Steps"; },
        onchange:function(v){ S.mode = v ? "stairs" : "steps"; save(); setTimeout(function(){E.showMenu(menu());},10); }
      },
      "Start hour": {
        value:S.startHour, min:0, max:23, step:1,
        onchange:function(v){S.startHour=v; save();}
      },
      "End hour": {
        value:S.endHour, min:0, max:23, step:1,
        onchange:function(v){S.endHour=v; save();}
      },
      "Max inactivity": {
        value:S.maxInactivityMin, min:15, max:120, step:5,
        format:function(v){return v+"m";},
        onchange:function(v){S.maxInactivityMin=v; save();}
      }
    };

    if (S.mode === "steps") {
      m["Min steps"] = {
        value:S.minSteps, min:10, max:500, step:10,
        onchange:function(v){S.minSteps=v; save();}
      };
    } else {
      m["Daily climb"] = {
        value:S.stairDailyTargetM, min:20, max:500, step:10,
        format:function(v){return v+"m";},
        onchange:function(v){S.stairDailyTargetM=v; save();}
      };
      m["Min climb"] = {
        value:S.stairMinSessionM, min:0.5, max:5, step:0.5,
        format:function(v){return v.toFixed(1)+"m";},
        onchange:function(v){S.stairMinSessionM=v; save();}
      };
      m["Behind tol"] = {
        value:S.stairBehindToleranceM, min:0, max:30, step:1,
        format:function(v){return v+"m";},
        onchange:function(v){S.stairBehindToleranceM=v; save();}
      };
      m["Pressure every"] = {
        value:S.pressureSampleSec, min:1, max:5, step:1,
        format:function(v){return v+"s";},
        onchange:function(v){S.pressureSampleSec=v; save();}
      };
      m["Motion hold"] = {
        value:S.motionHoldSec, min:5, max:20, step:1,
        format:function(v){return v+"s";},
        onchange:function(v){S.motionHoldSec=v; save();}
      };
      m["Max vert speed"] = {
        value:S.stairMaxSpeedMps, min:0.5, max:2.0, step:0.1,
        format:function(v){return v.toFixed(1)+"m/s";},
        onchange:function(v){S.stairMaxSpeedMps=v; save();}
      };
    }

    m["Dismiss delay"] = {
      value:S.dismissDelayMin, min:5, max:60, step:5,
      format:function(v){return v+"m";},
      onchange:function(v){S.dismissDelayMin=v; save();}
    };
    m["Pause delay"] = {
      value:S.pauseDelayMin, min:30, max:240, step:5,
      format:function(v){return v+"m";},
      onchange:function(v){S.pauseDelayMin=v; save();}
    };
    m["Temp threshold"] = {
      value:S.tempThreshold, min:20, max:40, step:0.5,
      format:function(v){return v.toFixed(1)+"C";},
      onchange:function(v){S.tempThreshold=v; save();}
    };
    m["Unlock on alert"] = {
      value:!!S.unlock,
      onchange:function(v){S.unlock=v; save();}
    };
    return m;
  }

  E.showMenu(menu());
})
