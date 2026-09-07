(function (back) {
  var Storage = require("Storage");
  var L = require("orbitloc").prefs;
  var FILE = "orbit.json";
  var d = {
    pref:12, place:0,
    locPref:"Tokyo", locName:"Tokyo", lat:35.681, lon:139.767,
    sunSize:10, earthSize:12, moonSize:6, markerSize:2
  };
  var s = Storage.readJSON(FILE,1) || {};
  Object.keys(d).forEach(function(k){ if (s[k]===undefined) s[k]=d[k]; });
  if(s.pref<0 || s.pref>=L.length) s.pref=12;
  if(s.place<0 || s.place>=L[s.pref][1].length) s.place=0;

  function applyLocation(){
    var p=L[s.pref][1][s.place];
    s.locPref=L[s.pref][0];
    s.locName=p[0];
    s.lat=p[1];
    s.lon=p[2];
  }
  function save(){ applyLocation(); Storage.writeJSON(FILE,s); }
  function show(){
    E.showMenu({
      "":{title:"Orbit"},
      "< Back":back,
      "Prefecture":{
        value:s.pref,min:0,max:L.length-1,
        format:function(v){return L[v][0];},
        onchange:function(v){s.pref=v;s.place=0;save();show();}
      },
      "Place":{
        value:s.place,min:0,max:L[s.pref][1].length-1,
        format:function(v){return L[s.pref][1][v][0];},
        onchange:function(v){s.place=v;save();}
      },
      "Selected":function(){applyLocation();E.showAlert(s.locPref+"\n"+s.locName,"Orbit location").then(show);},
      "Sun size":{value:s.sunSize,min:6,max:15,step:1,onchange:function(v){s.sunSize=v;save();}},
      "Earth size":{value:s.earthSize,min:8,max:40,step:1,onchange:function(v){s.earthSize=v;save();}},
      "Moon size":{value:s.moonSize,min:3,max:9,step:1,onchange:function(v){s.moonSize=v;save();}},
      "Marker size":{value:s.markerSize,min:1,max:4,step:1,onchange:function(v){s.markerSize=v;save();}}
    });
  }
  save();
  show();
})
