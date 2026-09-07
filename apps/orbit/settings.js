(function (back) {
  var Storage = require("Storage");
  var L = require("orbitloc").prefs;
  var FILE = "orbit.json";
  var d = { pref:12, place:0, sunSize:10, earthSize:12, moonSize:6, markerSize:2 };
  var s = Storage.readJSON(FILE,1) || {};
  Object.keys(d).forEach(function(k){ if (s[k]===undefined) s[k]=d[k]; });
  function save(){ Storage.writeJSON(FILE,s); }
  function placeName(){ return L[s.pref][1][s.place][0]; }
  function show(){
    if (s.place<0 || s.place>2) s.place=0;
    E.showMenu({
      "":{title:"Orbit"},
      "< Back":back,
      "Prefecture":{
        value:s.pref,min:0,max:L.length-1,
        format:function(v){return L[v][0];},
        onchange:function(v){s.pref=v;s.place=0;save();}
      },
      "Place":{
        value:s.place,min:0,max:2,
        format:function(v){return L[s.pref][1][v][0];},
        onchange:function(v){s.place=v;save();}
      },
      "Selected":function(){E.showAlert(L[s.pref][0]+"\n"+placeName(),"Orbit location").then(show);},
      "Sun size":{value:s.sunSize,min:6,max:15,step:1,onchange:function(v){s.sunSize=v;save();}},
      "Earth size":{value:s.earthSize,min:8,max:16,step:1,onchange:function(v){s.earthSize=v;save();}},
      "Moon size":{value:s.moonSize,min:3,max:9,step:1,onchange:function(v){s.moonSize=v;save();}},
      "Marker size":{value:s.markerSize,min:1,max:4,step:1,onchange:function(v){s.markerSize=v;save();}}
    });
  }
  show();
})
