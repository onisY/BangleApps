(function (back) {
  var Storage=require("Storage");
  var D=require("orbitloc"), C=D.countries, P=D.prefs;
  var FILE="orbit.json", SHOT_STATE="orbitshot.json", SHOT_MAX=20;
  var GPS_ID="orbitsettings";
  var d={locationMode:0,countryName:"Japan",pref:12,place:0,
    locPref:"Tokyo",locName:"Chiyoda-ku",lat:35.694,lon:139.754,elevationM:16,
    manualLat:35.694,manualLon:139.754,manualElevationM:16,
    sunSize:6,earthSize:30,moonSize:9,markerSize:2,
    earthStyle:0,earthDayColor:6,earthNightColor:4,earthEdgeColor:7,viewSide:0};
  var LOCATION_MODES=["Place","Manual","GPS"];
  var EARTH_STYLES=["Current","Custom colors","N/S Hemi map"];
  var VIEW_SIDES=["North","South"];
  var EARTH_COLOR_NAMES=["Black","Red","Green","Yellow","Blue","Magenta","Cyan","White"];
  var s=Storage.readJSON(FILE,1)||{};
  var gpsHandler,gpsActive=false,gpsReturnMode=0;
  var gpsStarted=0,gpsLastDraw=0,gpsLastSats=-1,gpsLastHdop=-1,gpsLastFix;
  var gpsFixAt=0,gpsFixLat,gpsFixLon,gpsAltSamples=[],gpsAltTimer;
  var GPS_ALT_SAMPLE_MS=20000;
  Object.keys(d).forEach(function(k){if(s[k]===undefined)s[k]=d[k];});
  if(s.locationMode<0||s.locationMode>2)s.locationMode=0;

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
  function applyManual(){
    s.locPref="Manual";s.locName="Custom";
    s.lat=s.manualLat;s.lon=s.manualLon;s.elevationM=s.manualElevationM;write();
  }
  function applyGPS(fix){
    s.locationMode=2;
    s.locPref="GPS";s.locName="GPS";
    s.lat=fix.lat;s.lon=fix.lon;
    s.elevationM=isFinite(fix.alt)?Math.round(fix.alt):0;
    write();
  }
  function median(a){
    if(!a.length)return NaN;
    var b=a.slice().sort(function(x,y){return x-y;}),n=b.length,m=n>>1;
    return n&1?b[m]:(b[m-1]+b[m])/2;
  }
  function applyCurrent(){
    if(s.locationMode===0)applyPlace();
    else if(s.locationMode===1)applyManual();
    // GPS mode deliberately keeps the most recently saved GPS fix.
  }

  function stopGPS(){
    if(gpsHandler){
      try{Bangle.removeListener("GPS",gpsHandler);}catch(e){}
      gpsHandler=undefined;
    }
    if(gpsAltTimer){clearTimeout(gpsAltTimer);gpsAltTimer=undefined;}
    gpsActive=false;gpsLastFix=undefined;
    try{Bangle.setGPSPower(0,GPS_ID);}catch(e){}
  }
  function gpsBar(sats){
    var n=Math.max(0,Math.min(8,sats|0)),t="[",i;
    for(i=0;i<8;i++)t+=i<n?"#":"-";
    return t+"]";
  }
  function gpsStateText(fix){
    var sats=fix&&isFinite(fix.satellites)?fix.satellites|0:0;
    if(gpsFixAt)return "ALTITUDE";
    if(fix&&fix.fix)return "FIX";
    if(sats===0)return "NO SATS";
    if(sats<3)return "SEARCHING";
    if(sats<4)return "ACQUIRING";
    return "LOCKING";
  }
  function gpsElapsed(){
    var sec=Math.max(0,Math.round((Date.now()-gpsStarted)/1000));
    var m=Math.floor(sec/60),ss=sec%60;
    return (m<10?"0":"")+m+":"+(ss<10?"0":"")+ss;
  }
  function showGPSProgress(force){
    if(!gpsActive)return;
    var fix=gpsLastFix||{},sats=isFinite(fix.satellites)?fix.satellites|0:0;
    var hdop=isFinite(fix.hdop)&&fix.hdop>0?fix.hdop:0;
    var now=Date.now();
    var hdChanged=(hdop&&gpsLastHdop>0)?Math.abs(hdop-gpsLastHdop)>=0.5:(hdop!==gpsLastHdop);
    if(!force && sats===gpsLastSats && !hdChanged && now-gpsLastDraw<10000)return;
    gpsLastSats=sats;gpsLastHdop=hdop;gpsLastDraw=now;
    var hd=hdop?hdop.toFixed(1):"--";
    var menu={
      "":{title:"GPS input"},
      "< Cancel":cancelGPS,
      "State":{value:0,min:0,max:0,format:function(){return gpsStateText(fix);}},
      "Satellites":{value:0,min:0,max:0,format:function(){return sats+" "+gpsBar(sats);}},
      "HDOP":{value:0,min:0,max:0,format:function(){return hd;}},
      "Elapsed":{value:0,min:0,max:0,format:function(){return gpsElapsed();}}
    };
    if(gpsFixAt){
      menu["Alt samples"]={value:0,min:0,max:0,format:function(){return ""+gpsAltSamples.length;}};
      menu["Alt wait"]={value:0,min:0,max:0,format:function(){
        var left=Math.max(0,Math.ceil((GPS_ALT_SAMPLE_MS-(Date.now()-gpsFixAt))/1000));
        return left+" s";
      }};
    }
    E.showMenu(menu);
  }
  function gpsLocationText(){
    return "Lat "+Number(s.lat).toFixed(4)+"\nLon "+Number(s.lon).toFixed(4)+
      "\nAlt "+Math.round(s.elevationM||0)+" m";
  }
  function cancelGPS(){
    stopGPS();
    s.locationMode=gpsReturnMode;
    applyCurrent();
    write();
    show();
  }
  function finishGPSAltitude(){
    if(!gpsActive||!gpsFixAt)return;
    var alt=median(gpsAltSamples);
    var finalFix={lat:gpsFixLat,lon:gpsFixLon,alt:isFinite(alt)?alt:0};
    applyGPS(finalFix);
    var count=gpsAltSamples.length;
    stopGPS();
    gpsFixAt=0;gpsAltSamples=[];
    try{Bangle.buzz(300);}catch(e){}
    E.showAlert("GPS location saved\n"+gpsLocationText()+"\nAlt samples "+count,"Orbit GPS").then(show);
  }
  function startGPS(returnMode){
    stopGPS();
    gpsReturnMode=(returnMode===0||returnMode===1||returnMode===2)?returnMode:s.locationMode;
    s.locationMode=2;write();
    gpsStarted=Date.now();gpsLastDraw=0;gpsLastSats=-1;gpsLastHdop=-1;gpsLastFix={};
    gpsFixAt=0;gpsFixLat=undefined;gpsFixLon=undefined;gpsAltSamples=[];
    gpsHandler=function(fix){
      if(!gpsActive||!fix)return;
      gpsLastFix=fix;
      if(fix.fix&&isFinite(fix.lat)&&isFinite(fix.lon)){
        if(!gpsFixAt){
          // Lock horizontal position at the first valid fix, but keep the GPS
          // running briefly so the noisier altitude can settle.
          gpsFixAt=Date.now();gpsFixLat=fix.lat;gpsFixLon=fix.lon;
          try{Bangle.buzz(80);}catch(e){}
          gpsAltTimer=setTimeout(finishGPSAltitude,GPS_ALT_SAMPLE_MS);
        }
        if(isFinite(fix.alt))gpsAltSamples.push(fix.alt);
        showGPSProgress(false);
        return;
      }
      showGPSProgress(false);
    };
    Bangle.on("GPS",gpsHandler);
    gpsActive=true;
    try{Bangle.setGPSPower(1,GPS_ID);}catch(e){stopGPS();E.showAlert("Could not start GPS","Orbit GPS").then(show);return;}
    showGPSProgress(true);
  }
  function onKill(){stopGPS();}
  function leave(){
    stopGPS();
    try{E.removeListener("kill",onKill);}catch(e){}
    back();
  }
  E.on("kill",onKill);
  // Clear any stale Orbit-only GPS power request left by an interrupted settings session.
  try{Bangle.setGPSPower(0,GPS_ID);}catch(e){}

  function shotName(i){return "orb"+(i<10?"0":"")+i+".bmp";}
  function shotCount(){var st=Storage.readJSON(SHOT_STATE,1);if(st&&isFinite(st.count))return Math.max(0,Math.min(SHOT_MAX,st.count|0));var n=0;for(var i=0;i<SHOT_MAX;i++)if(Storage.read(shotName(i))!==undefined)n++;return n;}
  function deleteShots(){for(var i=0;i<SHOT_MAX;i++)Storage.erase(shotName(i));Storage.erase(SHOT_STATE);}

  function show(){
    var m={"":{title:"Orbit"},"< Back":leave,
      "Location mode":{value:s.locationMode,min:0,max:2,format:function(v){return LOCATION_MODES[v];},onchange:function(v){
        var old=s.locationMode;
        stopGPS();
        if(v===0){s.locationMode=0;applyPlace();show();}
        else if(v===1){s.locationMode=1;s.manualLat=s.lat;s.manualLon=s.lon;s.manualElevationM=s.elevationM||0;applyManual();show();}
        else startGPS(old);
      }}};
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
    }else if(s.locationMode===1){
      m["Latitude"]={value:s.manualLat,min:-90,max:90,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.manualLat=v;applyManual();}};
      m["Longitude"]={value:s.manualLon,min:-180,max:180,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.manualLon=v;applyManual();}};
      m["Elevation m"]={value:s.manualElevationM,min:-500,max:9000,step:1,onchange:function(v){s.manualElevationM=v;applyManual();}};
    }else{
      m["Get GPS fix"]=function(){startGPS(2);};
      m["Location info"]=function(){E.showAlert(gpsLocationText(),"GPS location").then(show);};
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
