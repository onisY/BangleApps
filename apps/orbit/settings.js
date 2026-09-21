(function(back){
  var Storage=require("Storage");
  var CFG="orbit.json",CAL="orbit.cal.json",EVENTS="orbit.events.json";
  var COLORS=["red","yellow","green","blue","cyan","magenta","orange","white","gray","black"];
  var TYPES=["holiday","family","birthday","custom"];
  var TYPE_NAMES=["Holiday","Anniversary","Birthday","Other"];
  var REGIONS=["all","jp","ew","sc","ni"];
  var REGION_NAMES=["All","Japan","England/Wales","Scotland","N. Ireland"];

  function readJSON(name,def){return Storage.readJSON(name,1)||def;}
  function appCfg(){
    var s=readJSON(CFG,{});
    if(!isFinite(s.lat))s.lat=35.694;if(!isFinite(s.lon))s.lon=139.754;
    if(!isFinite(s.sunSize))s.sunSize=6;if(!isFinite(s.earthSize))s.earthSize=30;
    if(!isFinite(s.moonSize))s.moonSize=7;if(!isFinite(s.moonOrbit))s.moonOrbit=44;
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

    // UI editor handles date events. Range events remain fully supported by
    // the calendar and can still be deleted or styled here.
    var isRange=!!(e.from&&e.to);
    var p=parseEventDate(e);
    var menu={"":{title:e.label||TYPE_NAMES[typeIndex(e.type)]},"< Back":function(){write(EVENTS,doc);eventsMenu();}};

    if(!isRange){
      menu["Repeat"]={value:e.repeat==="yearly",format:function(v){return v?"Yearly":"Once";},onchange:function(v){
        e.repeat=v?"yearly":undefined;writeEventDate(e,p);write(EVENTS,doc);setTimeout(function(){editEvent(i);},10);
      }};
      if(e.repeat!=="yearly")menu["Year"]={value:p.y,min:2020,max:2100,step:1,onchange:function(v){p.y=v;writeEventDate(e,p);write(EVENTS,doc);}};
      menu["Month"]={value:p.m,min:1,max:12,step:1,wrap:true,onchange:function(v){p.m=v;p.d=clampDay(p.y,p.m,p.d);writeEventDate(e,p);write(EVENTS,doc);}};
      menu["Day"]={value:p.d,min:1,max:31,step:1,wrap:true,onchange:function(v){p.d=clampDay(p.y,p.m,v);writeEventDate(e,p);write(EVENTS,doc);}};
    }else{
      menu["Range"]={value:0,min:0,max:0,format:function(){return String(e.from)+".."+String(e.to);}};
    }

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
      var key=eventTitle(doc.events[idx],idx);
      m[key]=function(){editEvent(idx);};
    })(i);
    E.showMenu(m);
  }

  function main(){
    var s=appCfg(),c=calCfg();
    var m={"":{title:"orbit"},"< Back":back,
      "Latitude":{value:s.lat,min:-90,max:90,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.lat=v;write(CFG,s);}},
      "Longitude":{value:s.lon,min:-180,max:180,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){s.lon=v;write(CFG,s);}},
      "Sun size":{value:s.sunSize,min:4,max:15,step:1,onchange:function(v){s.sunSize=v;write(CFG,s);}},
      "Earth size":{value:s.earthSize,min:25,max:50,step:1,onchange:function(v){s.earthSize=v;write(CFG,s);}},
      "Moon size":{value:s.moonSize,min:4,max:15,step:1,onchange:function(v){s.moonSize=v;write(CFG,s);}},
      "Moon orbit":{value:s.moonOrbit,min:40,max:80,step:1,onchange:function(v){s.moonOrbit=v;write(CFG,s);}},
      "Calendar region":{value:calRegion(c),min:0,max:3,step:1,format:function(v){return REGION_NAMES[v===0?1:v+1]||["Japan","England/Wales","Scotland","N. Ireland"][v];},onchange:function(v){setCalRegion(c,v);}},
      "Auto return":{value:c.timeout,min:15,max:120,step:15,format:function(v){return v+" s";},onchange:function(v){c.timeout=v;write(CAL,c);}},
      "Events":eventsMenu,
      "Holiday cache":cacheMenu
    };
    // Explicit formatter avoids the "All" entry used by event region selection.
    m["Calendar region"].format=function(v){return ["Japan","England/Wales","Scotland","N. Ireland"][v];};
    E.showMenu(m);
  }

  main();
})