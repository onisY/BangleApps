/* Orbclo Dev Settings 0.01 - isolated settings test */
(function(){
  var Storage=require("Storage"),FILE="orbclo_settingsdev.json";
  var s=Storage.readJSON(FILE,1)||{};
  var d={locationMode:0,countryName:"Japan",pref:12,place:0,locPref:"Tokyo",locName:"Chiyoda-ku",lat:35.694,lon:139.754,manualLat:35.694,manualLon:139.754,sunSize:6,earthSize:30,moonSize:9,markerSize:2,earthStyle:0,earthDayColor:6,earthNightColor:4,earthEdgeColor:7,viewSide:0};
  var LOCATION_MODES=["Place","Manual","GPS"],EARTH_STYLES=["Current","Custom colors","N/S Hemi map"],VIEW_SIDES=["North","South"],COLORS=["Black","Red","Green","Yellow","Blue","Magenta","Cyan","White"];
  Object.keys(d).forEach(function(k){if(s[k]===undefined)s[k]=d[k];});
  function write(){Storage.writeJSON(FILE,s);}
  function leave(){Bangle.showLauncher();}
  function show(){
    var m={"":{title:"Orbclo Settings Dev"},"< Back":leave,
      "Location mode":{value:s.locationMode,min:0,max:2,format:function(v){return LOCATION_MODES[v];},onchange:function(v){s.locationMode=v;write();show();}}};
    if(s.locationMode===0){
      m["Country"]={value:0,min:0,max:0,format:function(){return s.countryName;}};
      m["Prefecture"]={value:s.pref,min:0,max:46,step:1,onchange:function(v){s.pref=v;write();}};
      m["Place"]={value:s.place,min:0,max:9,step:1,onchange:function(v){s.place=v;write();}};
      m["Location info"]=function(){E.showAlert("UI/storage test\nLat "+s.lat.toFixed(3)+"\nLon "+s.lon.toFixed(3),"Orbclo location").then(show);};
    } else if(s.locationMode===1){
      m["Latitude"]={value:s.manualLat,min:-90,max:90,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.manualLat=v;s.lat=v;write();}};
      m["Longitude"]={value:s.manualLon,min:-180,max:180,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.manualLon=v;s.lon=v;write();}};
    } else {
      m["Get GPS fix"]=function(){E.showAlert("GPS is intentionally disabled in this first isolated settings test.","Orbclo GPS").then(show);};
      m["Location info"]=function(){E.showAlert("Lat "+s.lat.toFixed(4)+"\nLon "+s.lon.toFixed(4),"GPS location").then(show);};
    }
    m["View side"]={value:s.viewSide,min:0,max:1,format:function(v){return VIEW_SIDES[v];},onchange:function(v){s.viewSide=v;write();show();}};
    m["Earth style"]={value:s.earthStyle,min:0,max:2,format:function(v){return EARTH_STYLES[v];},onchange:function(v){s.earthStyle=v;write();show();}};
    if(s.earthStyle===1){
      m["Earth day"]={value:s.earthDayColor,min:0,max:7,format:function(v){return COLORS[v];},onchange:function(v){s.earthDayColor=v;write();}};
      m["Earth night"]={value:s.earthNightColor,min:0,max:7,format:function(v){return COLORS[v];},onchange:function(v){s.earthNightColor=v;write();}};
      m["Earth edge"]={value:s.earthEdgeColor,min:0,max:7,format:function(v){return COLORS[v];},onchange:function(v){s.earthEdgeColor=v;write();}};
    }
    m["Sun size"]={value:s.sunSize,min:3,max:15,step:1,onchange:function(v){s.sunSize=v;write();}};
    m["Earth size"]={value:s.earthSize,min:8,max:48,step:1,onchange:function(v){s.earthSize=v;write();}};
    m["Moon size"]={value:s.moonSize,min:3,max:18,step:1,onchange:function(v){s.moonSize=v;write();}};
    m["Marker size"]={value:s.markerSize,min:1,max:4,step:1,onchange:function(v){s.markerSize=v;write();}};
    E.showMenu(m);
  }
  show();
})();
