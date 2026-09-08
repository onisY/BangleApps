(function (back) {
  var Storage = require("Storage");
  var L = require("orbitloc").prefs;
  var FILE = "orbit.json";
  var SHOT_STATE = "orbitshot.json";
  var SHOT_MAX = 20;
  var d = {
    locationMode:0, // 0=Place, 1=Manual
    pref:12, place:0,
    locPref:"Tokyo", locName:"Chiyoda-ku", lat:35.694, lon:139.754, elevationM:0,
    manualLat:35.694, manualLon:139.754, manualElevationM:0,
    sunSize:6, earthSize:30, moonSize:9, markerSize:2
  };
  var s = Storage.readJSON(FILE,1) || {};
  Object.keys(d).forEach(function(k){ if (s[k]===undefined) s[k]=d[k]; });
  if(s.pref<0 || s.pref>=L.length) s.pref=12;
  if(s.place<0 || s.place>=L[s.pref][1].length) s.place=0;

  function write(){ Storage.writeJSON(FILE,s); }

  function applyPlace(){
    var p=L[s.pref][1][s.place];
    s.locPref=L[s.pref][0];
    s.locName=p[0];
    s.lat=p[1];
    s.lon=p[2];
    s.elevationM=(p.length>3 && isFinite(p[3])) ? p[3] : 0;
    write();
  }

  function applyManual(){
    s.locPref="Manual";
    s.locName="Custom";
    s.lat=s.manualLat;
    s.lon=s.manualLon;
    s.elevationM=s.manualElevationM;
    write();
  }

  function applyCurrent(){
    if(s.locationMode===1) applyManual();
    else applyPlace();
  }

  function shotName(i){
    return "orb"+(i<10?"0":"")+i+".bmp";
  }
  function shotCount(){
    var st=Storage.readJSON(SHOT_STATE,1);
    if(st && isFinite(st.count)) return Math.max(0,Math.min(SHOT_MAX,st.count|0));
    var n=0;
    for(var i=0;i<SHOT_MAX;i++) if(Storage.read(shotName(i))!==undefined) n++;
    return n;
  }
  function deleteShots(){
    for(var i=0;i<SHOT_MAX;i++) Storage.erase(shotName(i));
    Storage.erase(SHOT_STATE);
  }

  function show(){
    var m={
      "":{title:"Orbit"},
      "< Back":back,
      "Location mode":{
        value:s.locationMode,min:0,max:1,
        format:function(v){return v?"Manual":"Place";},
        onchange:function(v){
          s.locationMode=v;
          if(v){
            s.manualLat=s.lat;
            s.manualLon=s.lon;
            s.manualElevationM=s.elevationM||0;
            applyManual();
          } else applyPlace();
          show();
        }
      }
    };

    if(s.locationMode===0){
      m["Prefecture"]={
        value:s.pref,min:0,max:L.length-1,
        format:function(v){return L[v][0];},
        onchange:function(v){s.pref=v;s.place=0;applyPlace();show();}
      };
      m["Place"]={
        value:s.place,min:0,max:L[s.pref][1].length-1,
        format:function(v){return L[s.pref][1][v][0];},
        onchange:function(v){s.place=v;applyPlace();}
      };
      m["Location info"]=function(){
        applyPlace();
        E.showAlert(
          s.locPref+" / "+s.locName+"\n"+
          "Lat "+s.lat.toFixed(3)+"\n"+
          "Lon "+s.lon.toFixed(3)+"\n"+
          "Alt "+Math.round(s.elevationM)+" m",
          "Orbit location"
        ).then(show);
      };
    } else {
      m["Latitude"]={
        value:s.manualLat,min:-90,max:90,step:0.001,
        format:function(v){return v.toFixed(3);},
        onchange:function(v){s.manualLat=v;applyManual();}
      };
      m["Longitude"]={
        value:s.manualLon,min:-180,max:180,step:0.001,
        format:function(v){return v.toFixed(3);},
        onchange:function(v){s.manualLon=v;applyManual();}
      };
      m["Elevation m"]={
        value:s.manualElevationM,min:-500,max:9000,step:1,
        onchange:function(v){s.manualElevationM=v;applyManual();}
      };
    }

    m["Screenshots"]=function(){
      E.showAlert(shotCount()+" / "+SHOT_MAX+" saved","Orbit shots").then(show);
    };
    m["Delete shots"]=function(){
      E.showPrompt("Delete all screenshots?",{title:"Orbit shots"}).then(function(ok){
        if(ok) deleteShots();
        show();
      });
    };
    m["Sun size"]={value:s.sunSize,min:3,max:15,step:1,onchange:function(v){s.sunSize=v;write();}};
    m["Earth size"]={value:s.earthSize,min:8,max:48,step:1,onchange:function(v){s.earthSize=v;write();}};
    m["Moon size"]={value:s.moonSize,min:3,max:12,step:1,onchange:function(v){s.moonSize=v;write();}};
    m["Marker size"]={value:s.markerSize,min:1,max:4,step:1,onchange:function(v){s.markerSize=v;write();}};
    E.showMenu(m);
  }

  applyCurrent();
  show();
})
