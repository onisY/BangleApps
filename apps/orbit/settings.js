(function(back){
  var Storage=require("Storage");
  var D=require("orbitloc"),C=D.countries,P=D.prefs;
  var CFG="orbit.json",CAL="orbit.cal.json",EVENTS="orbit.events.json";
  var GPS_ID="orbitsettings";
  var COLORS=["red","yellow","green","blue","cyan","magenta","orange","white","gray","black"];
  var TYPES=["holiday","family","birthday","custom"];
  var TYPE_NAMES=["Holiday","Anniversary","Birthday","Other"];
  var REGIONS=["all","jp","ew","sc","ni"];
  var REGION_NAMES=["All","Japan","England/Wales","Scotland","N. Ireland"];
  var LOCATION_MODES=["Place","Manual","GPS"];
  var gpsHandler,gpsActive=false,gpsStarted=0,gpsLastDraw=0,gpsLastSats=-1,gpsLastHdop=-1,gpsLastFix;

  function readJSON(name,def){return Storage.readJSON(name,1)||def;}
  function countryIndex(name){for(var i=0;i<C.length;i++)if(C[i][0]===name)return i;return -1;}
  function prefIndex(name){for(var i=0;i<P.length;i++)if(P[i][0]===name)return i;return -1;}
  function appCfg(){
    var s=readJSON(CFG,{});
    if(!isFinite(s.lat))s.lat=35.694;if(!isFinite(s.lon))s.lon=139.754;
    if(!isFinite(s.sunSize))s.sunSize=8;if(!isFinite(s.earthSize))s.earthSize=42;
    if(!isFinite(s.moonSize))s.moonSize=15;if(!isFinite(s.moonOrbit))s.moonOrbit=62;
    s.sunSize=Math.max(6,Math.min(15,s.sunSize|0));
    s.earthSize=Math.max(40,Math.min(45,s.earthSize|0));
    s.moonSize=Math.max(14,Math.min(16,s.moonSize|0));
    var minOrbit=s.earthSize+s.moonSize+4;
    s.moonOrbit=Math.max(minOrbit,Math.min(70,s.moonOrbit|0));
    s.layoutVersion=2;

    // Preserve pre-location-mode coordinates from the consolidated orbit build.
    if(s.locationMode===undefined){
      s.locationMode=1;
      s.manualLat=s.lat;s.manualLon=s.lon;
    }
    if(s.locationMode<0||s.locationMode>2)s.locationMode=1;
    if(!isFinite(s.manualLat))s.manualLat=s.lat;
    if(!isFinite(s.manualLon))s.manualLon=s.lon;
    if(s.viewSide!==0&&s.viewSide!==1)s.viewSide=0;
    if(!s.countryName)s.countryName="Japan";
    if(!isFinite(s.pref))s.pref=12;
    s.pref=Math.max(0,Math.min(P.length-1,s.pref|0));

    // Migrate settings from the older Orbit location scheme when present.
    var pi=prefIndex(s.locPref);
    if(pi>=0){s.countryName="Japan";s.pref=pi;}
    if(countryIndex(s.countryName)<0)s.countryName="Japan";
    if(!isFinite(s.place))s.place=0;
    if(s.countryName!=="Japan"){
      var ci=countryIndex(s.countryName),list=C[ci][1]||[],found=-1;
      if(s.locName)for(var li=0;li<list.length;li++)if(list[li][0]===s.locName){found=li;break;}
      if(found>=0)s.place=found;
      s.place=Math.max(0,Math.min(Math.max(0,list.length-1),s.place|0));
    }
    return s;
  }
  function calCfg(){
    var c=readJSON(CAL,{});
    if(c.lang!=="ja"&&c.lang!=="en")c.lang="ja";
    if(c.ukRegion!=="ew"&&c.ukRegion!=="sc"&&c.ukRegion!=="ni")c.ukRegion="ew";
    if(!(c.timeout>=15&&c.timeout<=120))c.timeout=30;
    return c;
  }
  function eventDoc(){
    var d=readJSON(EVENTS,{version:1,events:[]});
    if(!Array.isArray(d.events))d={version:1,events:[]};
    return d;
  }
  function write(name,obj){Storage.writeJSON(name,obj);}
  function pad2(n){return (n<10?"0":"")+n;}
  function dim(y,m){return m===2?(((y%4===0&&y%100!==0)||y%400===0)?29:28):[31,0,31,30,31,30,31,31,30,31,30,31][m-1];}
  function clampDay(y,m,d){return Math.max(1,Math.min(dim(y,m),d|0));}
  function calRegion(c){if(c.lang==="ja")return 0;if(c.ukRegion==="sc")return 2;if(c.ukRegion==="ni")return 3;return 1;}
  function activeRegion(c){return c.lang==="ja"?"jp":c.ukRegion;}
  function setCalRegion(c,v){
    if(v===0)c.lang="ja";
    else{c.lang="en";c.ukRegion=v===2?"sc":(v===3?"ni":"ew");}
    write(CAL,c);
  }
  function colorIndex(v){var i=COLORS.indexOf(v);return i<0?1:i;}
  function typeIndex(v){var i=TYPES.indexOf(v);return i<0?3:i;}
  function regionIndex(v){var i=REGIONS.indexOf(v);return i<0?0:i;}
  function defaultColor(type){return type==="holiday"?"red":type==="birthday"?"magenta":type==="family"?"yellow":"yellow";}

  // ---------- Location ----------
  function placeFor(s){
    var ci=countryIndex(s.countryName);
    if(ci<0){s.countryName="Japan";ci=countryIndex("Japan");}
    if(s.countryName==="Japan"){
      s.pref=Math.max(0,Math.min(P.length-1,s.pref|0));
      return {group:P[s.pref][0],place:P[s.pref][1][0]};
    }
    var list=C[ci][1]||[];
    s.place=Math.max(0,Math.min(Math.max(0,list.length-1),isFinite(s.place)?(s.place|0):0));
    return {group:C[ci][0],place:list[s.place]};
  }
  function applyPlace(s){
    var q=placeFor(s),p=q.place;if(!p)return;
    s.locationMode=0;s.locPref=q.group;s.locName=p[0];s.lat=p[1];s.lon=p[2];write(CFG,s);
  }
  function applyManual(s){
    s.locationMode=1;s.locPref="Manual";s.locName="Custom";
    s.lat=s.manualLat;s.lon=s.manualLon;write(CFG,s);
  }
  function applyGPS(s,fix){
    s.locationMode=2;s.locPref="GPS";s.locName="GPS";
    s.lat=fix.lat;s.lon=fix.lon;write(CFG,s);
  }
  function stopGPS(){
    if(gpsHandler){try{Bangle.removeListener("GPS",gpsHandler);}catch(e){}gpsHandler=undefined;}
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
    if(fix&&fix.fix)return "FIX";
    if(sats===0)return "NO SATS";
    if(sats<3)return "SEARCHING";
    if(sats<4)return "ACQUIRING";
    return "LOCKING";
  }
  function gpsElapsed(){
    var sec=Math.max(0,Math.round((Date.now()-gpsStarted)/1000)),m=Math.floor(sec/60),ss=sec%60;
    return (m<10?"0":"")+m+":"+(ss<10?"0":"")+ss;
  }
  function gpsLocationText(s){return "Lat "+Number(s.lat).toFixed(4)+"\nLon "+Number(s.lon).toFixed(4);}
  function showGPSProgress(s,force){
    if(!gpsActive)return;
    var fix=gpsLastFix||{},sats=isFinite(fix.satellites)?fix.satellites|0:0;
    var hdop=isFinite(fix.hdop)&&fix.hdop>0?fix.hdop:0,now=Date.now();
    var hdChanged=(hdop&&gpsLastHdop>0)?Math.abs(hdop-gpsLastHdop)>=0.5:(hdop!==gpsLastHdop);
    if(!force&&sats===gpsLastSats&&!hdChanged&&now-gpsLastDraw<10000)return;
    gpsLastSats=sats;gpsLastHdop=hdop;gpsLastDraw=now;
    E.showMenu({
      "":{title:"GPS input"},
      "< Cancel":function(){stopGPS();locationMenu();},
      "State":{value:0,min:0,max:0,format:function(){return gpsStateText(fix);}},
      "Satellites":{value:0,min:0,max:0,format:function(){return sats+" "+gpsBar(sats);}},
      "HDOP":{value:0,min:0,max:0,format:function(){return hdop?hdop.toFixed(1):"--";}},
      "Elapsed":{value:0,min:0,max:0,format:function(){return gpsElapsed();}}
    });
  }
  function startGPS(){
    var s=appCfg();
    stopGPS();
    s.locationMode=2;write(CFG,s);
    gpsStarted=Date.now();gpsLastDraw=0;gpsLastSats=-1;gpsLastHdop=-1;gpsLastFix={};
    gpsHandler=function(fix){
      if(!gpsActive||!fix)return;
      gpsLastFix=fix;
      if(fix.fix&&isFinite(fix.lat)&&isFinite(fix.lon)){
        applyGPS(s,fix);stopGPS();
        try{Bangle.buzz(300);}catch(e){}
        E.showAlert("GPS location saved\n"+gpsLocationText(s),"orbit GPS").then(locationMenu);
        return;
      }
      showGPSProgress(s,false);
    };
    Bangle.on("GPS",gpsHandler);gpsActive=true;
    try{Bangle.setGPSPower(1,GPS_ID);}
    catch(e){stopGPS();E.showAlert("Could not start GPS","orbit GPS").then(locationMenu);return;}
    showGPSProgress(s,true);
  }
  function locationInfo(s){
    var prefix=s.locationMode===0?(s.countryName==="Japan"?"Japan / "+s.locPref:s.locPref):(s.locationMode===2?"GPS":"Manual");
    E.showAlert(prefix+" / "+(s.locName||"")+
      "\nLat "+Number(s.lat).toFixed(3)+"\nLon "+Number(s.lon).toFixed(3),"orbit location").then(locationMenu);
  }
  function locationMenu(){
    stopGPS(); // Merely viewing/changing non-GPS settings never leaves GPS powered.
    var s=appCfg(),ci=countryIndex(s.countryName);if(ci<0)ci=countryIndex("Japan");
    var m={"":{title:"Location"},"< Back":main,
      "Location mode":{
        value:s.locationMode,min:0,max:2,step:1,
        format:function(v){return LOCATION_MODES[v];},
        onchange:function(v){
          stopGPS();
          if(v===0){s.locationMode=0;applyPlace(s);}
          else if(v===1){s.locationMode=1;s.manualLat=s.lat;s.manualLon=s.lon;applyManual(s);}
          else{s.locationMode=2;write(CFG,s);} // GPS stays OFF until Get GPS fix is pressed.
          setTimeout(locationMenu,10);
        }
      }
    };
    if(s.locationMode===0){
      m["Country"]={value:ci,min:0,max:C.length-1,step:1,
        format:function(v){return C[v][0];},
        onchange:function(v){s.countryName=C[v][0];s.place=0;applyPlace(s);setTimeout(locationMenu,10);}
      };
      if(s.countryName==="Japan"){
        m["Prefecture"]={value:s.pref,min:0,max:P.length-1,step:1,
          format:function(v){return P[v][0];},
          onchange:function(v){s.pref=v;applyPlace(s);}
        };
        m["Capital"]={value:0,min:0,max:0,format:function(){return P[s.pref][1][0][0];}};
      }else{
        var list=C[ci][1]||[];
        if(list.length>1){
          s.place=Math.max(0,Math.min(list.length-1,s.place|0));
          m["City"]={value:s.place,min:0,max:list.length-1,step:1,
            format:function(v){return list[v][0];},
            onchange:function(v){s.place=v;applyPlace(s);}
          };
        }else{
          m["Capital"]={value:0,min:0,max:0,format:function(){return list[0][0];}};
        }
      }
      m["Location info"]=function(){applyPlace(s);locationInfo(s);};
    }else if(s.locationMode===1){
      m["Latitude"]={value:s.manualLat,min:-90,max:90,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.manualLat=v;applyManual(s);}};
      m["Longitude"]={value:s.manualLon,min:-180,max:180,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.manualLon=v;applyManual(s);}};
      m["Location info"]=function(){applyManual(s);locationInfo(s);};
    }else{
      m["Get GPS fix"]=startGPS;
      m["Location info"]=function(){locationInfo(s);};
      m["GPS power"]={value:0,min:0,max:0,format:function(){return "Off";}};
    }
    E.showMenu(m);
  }

  // ---------- Holiday cache ----------
  function cacheInfo(){
    var out={jp:0,ew:0,sc:0,ni:0,total:0};
    Storage.list(/^orh[0-9]+(jp|ew|sc|ni)[0-9][0-9][0-9][0-9]$/).forEach(function(f){
      var m=/^orh[0-9]+(jp|ew|sc|ni)[0-9][0-9][0-9][0-9]$/.exec(f);
      if(m){out[m[1]]++;out.total++;}
    });
    return out;
  }
  function clearCache(region,cb){
    var n=0;
    Storage.list(/^orh[0-9]+(jp|ew|sc|ni)[0-9][0-9][0-9][0-9]$/).forEach(function(f){
      var m=/^orh[0-9]+(jp|ew|sc|ni)[0-9][0-9][0-9][0-9]$/.exec(f);
      if(m&&(!region||m[1]===region)){Storage.erase(f);n++;}
    });
    E.showAlert("Deleted "+n,"Holiday cache").then(cb);
  }
  function cacheMenu(){
    var n=cacheInfo(),m={"":{title:"Holiday cache"},"< Back":main};
    [["jp","Japan",n.jp],["ew","England/Wales",n.ew],["sc","Scotland",n.sc],["ni","N. Ireland",n.ni]].forEach(function(x){
      m[x[1]+" ("+x[2]+")"]=function(){E.showPrompt("Delete "+x[1]+" cache?").then(function(ok){if(ok)clearCache(x[0],cacheMenu);else cacheMenu();});};
    });
    m["All ("+n.total+")"]=function(){E.showPrompt("Delete all holiday cache?").then(function(ok){if(ok)clearCache(undefined,cacheMenu);else cacheMenu();});};
    E.showMenu(m);
  }

  // ---------- Personal/exceptional events ----------
  function parseEventDate(e){
    var now=new Date(),y=now.getFullYear(),m=now.getMonth()+1,d=now.getDate();
    if(typeof e.date==="string"){
      var p=e.date.split("-");
      if(p.length===3){y=parseInt(p[0],10)||y;m=parseInt(p[1],10)||m;d=parseInt(p[2],10)||d;}
      else if(p.length===2){m=parseInt(p[0],10)||m;d=parseInt(p[1],10)||d;}
    }
    d=clampDay(y,m,d);return {y:y,m:m,d:d};
  }
  function writeEventDate(e,p){
    p.d=clampDay(p.y,p.m,p.d);
    e.date=e.repeat==="yearly"?(pad2(p.m)+"-"+pad2(p.d)):(p.y+"-"+pad2(p.m)+"-"+pad2(p.d));
  }
  function eventTitle(e,i){
    var label=e.label||TYPE_NAMES[typeIndex(e.type)],date=e.date||"range";
    return (i+1)+" "+date+" "+label;
  }
  function hasTextInput(){try{return !!require("textinput");}catch(e){return false;}}
  function editEvent(i){
    var doc=eventDoc(),e=doc.events[i];
    if(!e){eventsMenu();return;}
    if(!e.type)e.type="custom";if(!e.region)e.region="all";if(!e.color)e.color=defaultColor(e.type);
    if(e.blink===undefined)e.blink=false;
    var isRange=!!(e.from&&e.to),p=parseEventDate(e);
    var menu={"":{title:e.label||TYPE_NAMES[typeIndex(e.type)]},"< Back":function(){write(EVENTS,doc);eventsMenu();}};
    if(!isRange){
      menu["Repeat"]={value:e.repeat==="yearly",format:function(v){return v?"Yearly":"Once";},onchange:function(v){
        e.repeat=v?"yearly":undefined;writeEventDate(e,p);write(EVENTS,doc);setTimeout(function(){editEvent(i);},10);
      }};
      if(e.repeat!=="yearly")menu["Year"]={value:p.y,min:2020,max:2100,step:1,onchange:function(v){p.y=v;writeEventDate(e,p);write(EVENTS,doc);}};
      menu["Month"]={value:p.m,min:1,max:12,step:1,wrap:true,onchange:function(v){p.m=v;p.d=clampDay(p.y,p.m,p.d);writeEventDate(e,p);write(EVENTS,doc);}};
      menu["Day"]={value:p.d,min:1,max:31,step:1,wrap:true,onchange:function(v){p.d=clampDay(p.y,p.m,v);writeEventDate(e,p);write(EVENTS,doc);}};
    }else menu["Range"]={value:0,min:0,max:0,format:function(){return String(e.from)+".."+String(e.to);}};
    menu["Type"]={value:typeIndex(e.type),min:0,max:TYPES.length-1,step:1,format:function(v){return TYPE_NAMES[v];},onchange:function(v){
      e.type=TYPES[v];e.color=defaultColor(e.type);write(EVENTS,doc);setTimeout(function(){editEvent(i);},10);
    }};
    menu["Region"]={value:regionIndex(e.region),min:0,max:REGIONS.length-1,step:1,format:function(v){return REGION_NAMES[v];},onchange:function(v){e.region=REGIONS[v];write(EVENTS,doc);}};
    menu["Color"]={value:colorIndex(e.color),min:0,max:COLORS.length-1,step:1,format:function(v){return COLORS[v];},onchange:function(v){e.color=COLORS[v];write(EVENTS,doc);}};
    menu["Blink"]={value:!!e.blink,format:function(v){return v?"On":"Off";},onchange:function(v){e.blink=!!v;write(EVENTS,doc);}};
    if(hasTextInput())menu["Label"]=function(){
      require("textinput").input({text:e.label||""}).then(function(t){if(t!==undefined)e.label=t;write(EVENTS,doc);editEvent(i);},function(){editEvent(i);});
    };
    menu["Delete"]=function(){
      E.showPrompt("Delete "+(e.label||"event")+"?").then(function(ok){if(ok){doc.events.splice(i,1);write(EVENTS,doc);eventsMenu();}else editEvent(i);});
    };
    E.showMenu(menu);
  }
  function addEvent(kind){
    var doc=eventDoc(),now=new Date(),c=calCfg();
    var e={
      date:kind==="holiday"?(now.getFullYear()+"-"+pad2(now.getMonth()+1)+"-"+pad2(now.getDate())):(pad2(now.getMonth()+1)+"-"+pad2(now.getDate())),
      repeat:kind==="holiday"?undefined:"yearly",
      type:kind==="holiday"?"holiday":"family",
      label:kind==="holiday"?"Holiday":"Anniversary",
      region:kind==="holiday"?activeRegion(c):"all",
      color:kind==="holiday"?"red":"yellow",
      blink:kind==="holiday"?false:true
    };
    doc.events.push(e);write(EVENTS,doc);editEvent(doc.events.length-1);
  }
  function eventsMenu(){
    var doc=eventDoc(),m={"":{title:"Events"},"< Back":main,
      "Add anniversary":function(){addEvent("family");},
      "Add holiday":function(){addEvent("holiday");}
    };
    for(var i=0;i<doc.events.length;i++)(function(idx){
      var key=eventTitle(doc.events[idx],idx);m[key]=function(){editEvent(idx);};
    })(i);
    E.showMenu(m);
  }

  function leave(){
    stopGPS();
    try{E.removeListener("kill",onKill);}catch(e){}
    back();
  }
  function exitToOrbit(){
    stopGPS();
    try{E.removeListener("kill",onKill);}catch(e){}
    load("orbit.app.js");
  }
  function onKill(){stopGPS();}

  function main(){
    stopGPS();
    var s=appCfg(),c=calCfg();
    var minOrbit=s.earthSize+s.moonSize+4;
    if(s.moonOrbit<minOrbit){s.moonOrbit=minOrbit;write(CFG,s);}
    var m={"":{title:"orbit"},"< Back":leave,
      "Exit to orbit":exitToOrbit,
      "Location":locationMenu,
      "View side":{value:s.viewSide,min:0,max:1,step:1,
        format:function(v){return v?"South":"North";},
        onchange:function(v){s.viewSide=v?1:0;write(CFG,s);}
      },
      "Sun size":{value:s.sunSize,min:6,max:15,step:1,onchange:function(v){s.sunSize=v;write(CFG,s);}},
      "Earth size":{value:s.earthSize,min:40,max:45,step:1,onchange:function(v){
        s.earthSize=v;var mn=s.earthSize+s.moonSize+4;if(s.moonOrbit<mn)s.moonOrbit=mn;
        write(CFG,s);setTimeout(main,10);
      }},
      "Moon size":{value:s.moonSize,min:14,max:16,step:1,onchange:function(v){
        s.moonSize=v;var mn=s.earthSize+s.moonSize+4;if(s.moonOrbit<mn)s.moonOrbit=mn;
        write(CFG,s);setTimeout(main,10);
      }},
      "Moon orbit":{value:s.moonOrbit,min:minOrbit,max:70,step:1,onchange:function(v){s.moonOrbit=v;write(CFG,s);}},
      "Calendar region":{value:calRegion(c),min:0,max:3,step:1,format:function(v){return ["Japan","England/Wales","Scotland","N. Ireland"][v];},onchange:function(v){setCalRegion(c,v);}},
      "Auto return":{value:c.timeout,min:15,max:120,step:15,format:function(v){return v+" s";},onchange:function(v){c.timeout=v;write(CAL,c);}},
      "Events":eventsMenu,
      "Holiday cache":cacheMenu
    };
    E.showMenu(m);
  }

  // Any stale request owned by a previously interrupted orbit settings
  // session is explicitly released. The runtime app itself never enables GPS.
  try{Bangle.setGPSPower(0,GPS_ID);}catch(e){}
  E.on("kill",onKill);
  main();
})