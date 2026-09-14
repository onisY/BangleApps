(function (back) {
  var Storage=require("Storage");
  var D=require("orbitloc"), C=D.countries, P=D.prefs;
  var FILE="orbit.json", SHOT_STATE="orbitshot.json", SHOT_MAX=20;
  var d={locationMode:0,countryName:"Japan",pref:12,place:0,
    locPref:"Tokyo",locName:"Chiyoda-ku",lat:35.694,lon:139.754,elevationM:16,
    manualLat:35.694,manualLon:139.754,manualElevationM:16,
    sunSize:6,earthSize:30,moonSize:9,markerSize:2,
    earthStyle:0,earthDayColor:6,earthNightColor:4,earthEdgeColor:7,viewSide:0};
  var EARTH_STYLES=["Current","Custom colors","N/S Hemi map"];
  var VIEW_SIDES=["North","South"];
  var EARTH_COLOR_NAMES=["Black","Red","Green","Yellow","Blue","Magenta","Cyan","White"];
  var s=Storage.readJSON(FILE,1)||{};
  Object.keys(d).forEach(function(k){if(s[k]===undefined)s[k]=d[k];});
  function countryIndex(name){for(var i=0;i<C.length;i++)if(C[i][0]===name)return i;return -1;}
  function prefIndex(name){for(var i=0;i<P.length;i++)if(P[i][0]===name)return i;return -1;}
  if(s.countryName===undefined){var pi=prefIndex(s.locPref);s.countryName=pi>=0?"Japan":s.locPref;}
  var ci=countryIndex(s.countryName);if(ci<0){s.countryName="Japan";ci=countryIndex("Japan");}
  if(s.pref<0||s.pref>=P.length)s.pref=12;
  if(s.countryName==="Japan"){
    var oldpi=prefIndex(s.locPref);if(oldpi>=0)s.pref=oldpi;
    if(s.place<0||s.place>=P[s.pref][1].length)s.place=0;
  } else {
    if(s.place<0||s.place>=C[ci][1].length)s.place=0;
  }
  function write(){Storage.writeJSON(FILE,s);}
  function applyPlace(){
    var idx=countryIndex(s.countryName),p;
    if(idx<0)return;
    if(s.countryName==="Japan"){
      p=P[s.pref][1][s.place];s.locPref=P[s.pref][0];
    }else{
      var places=C[idx][1];if(!places.length)return;
      if(s.place>=places.length)s.place=0;p=places[s.place];s.locPref=C[idx][0];
    }
    s.locName=p[0];s.lat=p[1];s.lon=p[2];s.elevationM=(p.length>3&&isFinite(p[3]))?p[3]:0;write();
  }
  function applyManual(){s.locPref="Manual";s.locName="Custom";s.lat=s.manualLat;s.lon=s.manualLon;s.elevationM=s.manualElevationM;write();}
  function applyCurrent(){if(s.locationMode===1)applyManual();else applyPlace();}
  function shotName(i){return "orb"+(i<10?"0":"")+i+".bmp";}
  function shotCount(){var st=Storage.readJSON(SHOT_STATE,1);if(st&&isFinite(st.count))return Math.max(0,Math.min(SHOT_MAX,st.count|0));var n=0;for(var i=0;i<SHOT_MAX;i++)if(Storage.read(shotName(i))!==undefined)n++;return n;}
  function deleteShots(){for(var i=0;i<SHOT_MAX;i++)Storage.erase(shotName(i));Storage.erase(SHOT_STATE);}
  function show(){
    var m={"":{title:"Orbit"},"< Back":back,
      "Location mode":{value:s.locationMode,min:0,max:1,format:function(v){return v?"Manual":"Place";},onchange:function(v){s.locationMode=v;if(v){s.manualLat=s.lat;s.manualLon=s.lon;s.manualElevationM=s.elevationM||0;applyManual();}else applyPlace();show();}}};
    if(s.locationMode===0){
      var cidx=countryIndex(s.countryName);if(cidx<0)cidx=countryIndex("Japan");
      m["Country"]={value:cidx,min:0,max:C.length-1,format:function(v){return C[v][0];},onchange:function(v){s.countryName=C[v][0];s.place=0;applyPlace();show();}};
      if(s.countryName==="Japan"){
        m["Prefecture"]={value:s.pref,min:0,max:P.length-1,format:function(v){return P[v][0];},onchange:function(v){s.pref=v;s.place=0;applyPlace();show();}};
        m["Place"]={value:s.place,min:0,max:P[s.pref][1].length-1,format:function(v){return P[s.pref][1][v][0];},onchange:function(v){s.place=v;applyPlace();}};
      }else{
        var places=C[cidx][1];
        if(places.length)m["Place"]={value:s.place,min:0,max:places.length-1,format:function(v){return places[v][0];},onchange:function(v){s.place=v;applyPlace();}};
      }
      m["Location info"]=function(){applyPlace();var prefix=s.countryName==="Japan"?("Japan / "+s.locPref):s.locPref;E.showAlert(prefix+" / "+s.locName+"\nLat "+s.lat.toFixed(3)+"\nLon "+s.lon.toFixed(3)+"\nAlt "+Math.round(s.elevationM)+" m","Orbit location").then(show);};
    }else{
      m["Latitude"]={value:s.manualLat,min:-90,max:90,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.manualLat=v;applyManual();}};
      m["Longitude"]={value:s.manualLon,min:-180,max:180,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.manualLon=v;applyManual();}};
      m["Elevation m"]={value:s.manualElevationM,min:-500,max:9000,step:1,onchange:function(v){s.manualElevationM=v;applyManual();}};
    }
    m["View side"]={value:s.viewSide,min:0,max:1,format:function(v){return VIEW_SIDES[v];},onchange:function(v){s.viewSide=v;write();show();}};
    m["Earth style"]={value:s.earthStyle,min:0,max:2,format:function(v){return EARTH_STYLES[v];},onchange:function(v){s.earthStyle=v;write();show();}};
    if(s.earthStyle===1){
      m["Earth day"]={value:s.earthDayColor,min:0,max:7,format:function(v){return EARTH_COLOR_NAMES[v];},onchange:function(v){s.earthDayColor=v;write();}};
      m["Earth night"]={value:s.earthNightColor,min:0,max:7,format:function(v){return EARTH_COLOR_NAMES[v];},onchange:function(v){s.earthNightColor=v;write();}};
      m["Earth edge"]={value:s.earthEdgeColor,min:0,max:7,format:function(v){return EARTH_COLOR_NAMES[v];},onchange:function(v){s.earthEdgeColor=v;write();}};
    }
    m["Screenshots"]=function(){E.showAlert(shotCount()+" / "+SHOT_MAX+" saved","Orbit shots").then(show);};
    m["Delete shots"]=function(){E.showPrompt("Delete all screenshots?",{title:"Orbit shots"}).then(function(ok){if(ok)deleteShots();show();});};
    m["Sun size"]={value:s.sunSize,min:3,max:15,step:1,onchange:function(v){s.sunSize=v;write();}};
    m["Earth size"]={value:s.earthSize,min:8,max:48,step:1,onchange:function(v){s.earthSize=v;write();}};
    m["Moon size"]={value:s.moonSize,min:3,max:18,step:1,onchange:function(v){s.moonSize=v;write();}};
    m["Marker size"]={value:s.markerSize,min:1,max:4,step:1,onchange:function(v){s.markerSize=v;write();}};
    E.showMenu(m);
  }
  applyCurrent();show();
})
