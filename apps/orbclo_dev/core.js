/* Orbclo 0.01 - fresh implementation for Bangle.js 2 */
(function(){
  var Storage=require("Storage");
  var W=g.getWidth(), H=g.getHeight();
  var BLACK=0x0000, WHITE=0xFFFF, NAVY=0x000F, BLUE=0x001F, GREEN=0x07E0,
      RED=0xF800, YELLOW=0xFFE0, ORANGE=0xFD20, CYAN=0x07FF, MAGENTA=0xF81F,
      DARKBLUE=0x0008, GRAY=0x7BEF;
  var DEG=Math.PI/180, DAY=86400000, SYNODIC=29.530588853;
  var CFG="orbclo.json", SHOTSTATE="orbcloshot.json", SHOTMAX=20;
  var SUNX=W-24, SUNY=48, EARTHX=55, EARTHY=119;

  var defaults={
    preset:0, locLabel:"Chiyoda",
    lat:35.694, lon:139.754,
    manualLat:35.694, manualLon:139.754,
    viewSide:0,
    earthMap:true,
    sunSize:6, earthSize:30, moonSize:8, markerSize:2,
    buzzEvents:true,
    calEnglish:false,
    calHolidays:true,
    calAutoReturn:30
  };
  var presets=[
    ["Chiyoda",35.694,139.754],
    ["Machida",35.547,139.439],
    ["Okutama",35.809,139.096],
    ["Manual",null,null]
  ];
  var cfg=Storage.readJSON(CFG,1)||{};
  Object.keys(defaults).forEach(function(k){if(cfg[k]===undefined)cfg[k]=defaults[k];});
  function saveCfg(){Storage.writeJSON(CFG,cfg);}

  var mode="orbit";
  var selectedDate;
  var dayOffset=0;
  var calStart;
  var calBlinkWhite=true;
  var tapTimer, tapCount=0, tapXY;
  var calBlinkTimer, calIdleTimer, minuteTimer, sceneTimer, eventTimer, gpsTimer;
  var gpsHandler, buttonWatch;
  var killed=false, widgetsLoaded=false;
  var battery=E.getBattery(), lastBattery=0;

  function clearTimer(t){if(t)clearTimeout(t);}
  function stopTap(){clearTimer(tapTimer);tapTimer=undefined;tapCount=0;tapXY=undefined;}
  function stopVisualTimers(){
    clearTimer(calBlinkTimer);calBlinkTimer=undefined;
    clearTimer(calIdleTimer);calIdleTimer=undefined;
    clearTimer(minuteTimer);minuteTimer=undefined;
    clearTimer(sceneTimer);sceneTimer=undefined;
    stopTap();
  }
  function transition(){
    if(!Bangle.isLCDOn())return;
    g.reset().setBgColor(NAVY).setColor(NAVY).clear();
    try{g.flip();}catch(e){}
  }
  function hideWidgets(){try{require("widget_utils").hide();}catch(e){}
  }
  function showWidgets(){
    try{
      if(!widgetsLoaded){Bangle.loadWidgets();widgetsLoaded=true;}
      require("widget_utils").show();
      Bangle.drawWidgets();
    }catch(e){try{Bangle.drawWidgets();}catch(x){}}
  }
  function setupCustomUI(){try{Bangle.setUI({mode:"custom"});}catch(e){}
  }

  function midnight(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
  function copyDay(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
  function addDays(d,n){var x=copyDay(d);x.setDate(x.getDate()+n);return x;}
  function sameDay(a,b){return !!a&&!!b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
  function dayNum(d){return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/DAY);}
  function mondayOf(d){var x=copyDay(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
  function sceneDate(){var d=new Date();if(dayOffset)d.setDate(d.getDate()+dayOffset);return d;}
  function pad2(n){return n<10?"0"+n:""+n;}
  function clamp(v,a,b){return v<a?a:(v>b?b:v);}
  function normDeg(v){v%=360;if(v<0)v+=360;return v;}

  function solarData(d){
    var y=d.getFullYear();
    var start=new Date(y,0,0,0,0,0,0).valueOf(), now=new Date(y,d.getMonth(),d.getDate(),0,0,0,0).valueOf();
    var n=Math.max(1,Math.round((now-start)/DAY));
    var hour=(d.valueOf()%DAY+DAY)%DAY/3600000;
    var gamma=2*Math.PI/365*(n-1+(hour-12)/24);
    var eq=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
    var dec=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
    var utcMin=((d.valueOf()/60000)%1440+1440)%1440;
    var solMin=utcMin+eq+4*cfg.lon;
    var ha=normDeg(solMin/4-180);if(ha>180)ha-=360;
    var c=(Math.sin(-0.833*DEG)-Math.sin(cfg.lat*DEG)*Math.sin(dec))/(Math.cos(cfg.lat*DEG)*Math.cos(dec));
    var h0=(c<=-1)?180:(c>=1?0:Math.acos(c)/DEG);
    return {eq:eq,dec:dec,ha:ha,h0:h0};
  }

  function moonPhase(d){
    var epoch=Date.UTC(2000,0,6,18,14,0);
    var p=((d.valueOf()-epoch)/DAY/SYNODIC)%1;if(p<0)p+=1;return p;
  }

  function headerBg(){return dayOffset?WHITE:NAVY;}
  function drawHeader(){
    var d=sceneDate(), bg=headerBg(), fg=dayOffset?BLACK:WHITE;
    var now=Date.now();if(!lastBattery||now-lastBattery>=300000){battery=E.getBattery();lastBattery=now;}
    g.setColor(bg).fillRect(0,0,W-1,23);
    var left=pad2(d.getMonth()+1)+"/"+pad2(d.getDate())+" "+pad2(d.getHours())+":"+pad2(d.getMinutes())+" ", btxt=battery+"%";
    g.setFont("Vector",14).setFontAlign(-1,0).setBgColor(bg);
    var tw=g.stringWidth(left)+g.stringWidth(btxt), x=(W-tw)>>1;
    g.setColor(fg).drawString(left,x,11);
    g.setColor(battery<=20?RED:fg).drawString(btxt,x+g.stringWidth(left),11);
  }

  function armMinute(){
    clearTimer(minuteTimer);
    if(mode!=="orbit"||!Bangle.isLCDOn())return;
    var wait=60000-(Date.now()%60000)+25;
    minuteTimer=setTimeout(function(){minuteTimer=undefined;if(mode!=="orbit"||!Bangle.isLCDOn())return;drawHeader();armMinute();},wait);
  }
  function armScene(){
    clearTimer(sceneTimer);
    if(mode!=="orbit"||!Bangle.isLCDOn())return;
    var q=300000, wait=q-(Date.now()%q)+50;
    sceneTimer=setTimeout(function(){sceneTimer=undefined;if(mode!=="orbit"||!Bangle.isLCDOn())return;drawOrbit();armScene();},wait);
  }

  function drawDayHalf(cx,cy,r,ux,uy,dayCol,nightCol){
    g.setColor(nightCol).fillCircle(cx,cy,r);
    g.setColor(dayCol);
    for(var yy=-r;yy<=r;yy++){
      var span=Math.sqrt(Math.max(0,r*r-yy*yy));
      var l=Math.ceil(-span), rr=Math.floor(span), th;
      if(Math.abs(ux)<0.0001){
        if(yy*uy>=0)g.drawLine(cx+l,cy+yy,cx+rr,cy+yy);
      }else{
        th=-yy*uy/ux;
        if(ux>0){var a=Math.max(l,Math.ceil(th));if(a<=rr)g.drawLine(cx+a,cy+yy,cx+rr,cy+yy);}
        else{var b=Math.min(rr,Math.floor(th));if(b>=l)g.drawLine(cx+l,cy+yy,cx+b,cy+yy);}
      }
    }
  }

  var northShapes=[
    [[-168,72],[-145,60],[-125,48],[-118,34],[-102,22],[-82,25],[-66,45],[-80,60],[-110,72],[-145,76],[-168,72]],
    [[-58,82],[-25,76],[-20,63],[-43,58],[-60,68],[-58,82]],
    [[-12,70],[22,72],[58,65],[92,70],[125,60],[155,52],[140,35],[115,24],[90,18],[62,22],[40,33],[22,39],[8,48],[-12,52],[-12,70]],
    [[130,31],[134,35],[139,39],[142,44],[145,46]],
    [[-9,58],[-4,54],[1,51]]
  ];
  var southShapes=[
    [[-80,-5],[-72,-18],[-70,-35],[-64,-52],[-55,-55],[-45,-32],[-50,-15],[-65,-5],[-80,-5]],
    [[10,-5],[30,-10],[42,-20],[33,-35],[20,-35],[12,-25],[10,-5]],
    [[112,-12],[145,-12],[153,-28],[140,-40],[116,-35],[112,-12]],
    [[47,-14],[50,-24],[46,-27],[44,-18],[47,-14]],
    [[166,-35],[174,-41],[178,-46]],
    [[-180,-68],[-120,-72],[-60,-70],[0,-74],[60,-71],[120,-73],[180,-68]]
  ];
  function project(lat,lon,obsAngle,r){
    var side=cfg.viewSide? -1:1;
    if(side*lat<0)return null;
    var rr=r*(90-side*lat)/90;
    var a=obsAngle+side*(lon-cfg.lon)*DEG;
    return [EARTHX+rr*Math.cos(a),EARTHY+rr*Math.sin(a)];
  }
  function drawMap(obsAngle,r){
    if(!cfg.earthMap)return;
    var shapes=cfg.viewSide?southShapes:northShapes;
    g.setColor(WHITE);
    for(var s=0;s<shapes.length;s++){
      var prev=null;
      for(var i=0;i<shapes[s].length;i++){
        var ll=shapes[s][i],p=project(ll[1],ll[0],obsAngle,r-2);
        if(prev&&p)g.drawLine(prev[0],prev[1],p[0],p[1]);
        prev=p;
      }
    }
  }

  function drawMoon(cx,cy,r,phase){
    g.setColor(DARKBLUE).fillCircle(cx,cy,r);
    g.setColor(YELLOW);
    var k=Math.cos(2*Math.PI*phase);
    for(var yy=-r;yy<=r;yy++){
      var span=Math.sqrt(Math.max(0,r*r-yy*yy));
      var x1,x2;
      if(phase<=0.5){x1=k*span;x2=span;}
      else{x1=-span;x2=-k*span;}
      if(x2>=x1)g.drawLine(cx+Math.ceil(x1),cy+yy,cx+Math.floor(x2),cy+yy);
    }
    g.setColor(WHITE).drawCircle(cx,cy,r);
  }

  function drawOrbit(){
    mode="orbit";hideWidgets();setupCustomUI();stopVisualTimers();
    g.reset().setBgColor(BLACK).setColor(BLACK).clear();
    var d=sceneDate(), sd=solarData(d), side=cfg.viewSide?-1:1;
    var sunAng=Math.atan2(SUNY-EARTHY,SUNX-EARTHX);
    var obsAng=sunAng+side*sd.ha*DEG;
    var er=clamp(cfg.earthSize,10,42), sr=clamp(cfg.sunSize,3,12), mr=clamp(cfg.moonSize,3,15);
    var ux=Math.cos(sunAng),uy=Math.sin(sunAng);

    g.setColor(WHITE).drawLine(EARTHX,EARTHY,SUNX,SUNY);
    var ray=er+10;
    g.setColor(YELLOW).drawLine(EARTHX,EARTHY,EARTHX+ray*Math.cos(sunAng+side*sd.h0*DEG),EARTHY+ray*Math.sin(sunAng+side*sd.h0*DEG));
    g.setColor(ORANGE).drawLine(EARTHX,EARTHY,EARTHX+ray*Math.cos(sunAng-side*sd.h0*DEG),EARTHY+ray*Math.sin(sunAng-side*sd.h0*DEG));

    g.setColor(YELLOW).fillCircle(SUNX,SUNY,sr);
    drawDayHalf(EARTHX,EARTHY,er,ux,uy,CYAN,BLACK);
    g.setColor(CYAN).drawCircle(EARTHX,EARTHY,er);
    drawMap(obsAng,er);

    var ox=EARTHX+er*Math.cos(obsAng), oy=EARTHY+er*Math.sin(obsAng);
    var tx=-Math.sin(obsAng),ty=Math.cos(obsAng),hlen=er+4;
    g.setColor(MAGENTA).drawLine(ox-tx*hlen,oy-ty*hlen,ox+tx*hlen,oy+ty*hlen);
    g.setColor(GREEN).drawLine(ox,oy,ox+Math.cos(obsAng)*18,oy+Math.sin(obsAng)*18);
    g.setColor(RED).fillCircle(ox,oy,clamp(cfg.markerSize,1,4));

    var phase=moonPhase(d), orbitR=er+mr+17;
    var ma=sunAng+side*phase*2*Math.PI;
    var mx=EARTHX+orbitR*Math.cos(ma), my=EARTHY+orbitR*Math.sin(ma);
    g.setColor(GRAY).drawCircle(EARTHX,EARTHY,orbitR);
    drawMoon(mx,my,mr,phase);

    var label=cfg.locLabel||"Location";
    g.setFont("6x8",1).setFontAlign(1,1).setColor(WHITE).setBgColor(BLACK);
    g.drawString(label,W-2,H-2);
    drawHeader();
    armMinute();armScene();
  }

  function nthMonday(y,m,n){var d=new Date(y,m,1),first=1+((8-d.getDay())%7);return first+7*(n-1);}
  function vernal(y){return Math.floor(20.8431+0.242194*(y-1980)-Math.floor((y-1980)/4));}
  function autumn(y){return Math.floor(23.2488+0.242194*(y-1980)-Math.floor((y-1980)/4));}
  function baseHoliday(d){
    var y=d.getFullYear(),m=d.getMonth(),n=d.getDate();
    if(m===0&&n===1)return true;
    if(m===0&&((y>=2000&&n===nthMonday(y,0,2))||(y<2000&&y>=1949&&n===15)))return true;
    if(m===1&&n===11&&y>=1967)return true;
    if(m===1&&n===23&&y>=2020)return true;
    if(m===2&&n===vernal(y))return true;
    if(m===3&&n===29)return true;
    if(m===4&&(n===3||n===5))return true;
    if(m===4&&n===4&&y>=2007)return true;
    if(m===6&&y!==2020&&y!==2021&&((y>=2003&&n===nthMonday(y,6,3))||(y>=1996&&y<2003&&n===20)))return true;
    if(m===7&&y>=2016&&y!==2020&&y!==2021&&n===11)return true;
    if(m===8&&((y>=2003&&n===nthMonday(y,8,3))||(y>=1966&&y<2003&&n===15)))return true;
    if(m===8&&n===autumn(y))return true;
    if(m===9&&((y>=2000&&n===nthMonday(y,9,2))||(y>=1966&&y<2000&&n===10)))return true;
    if(m===10&&(n===3||n===23))return true;
    if(m===11&&n===23&&y>=1989&&y<=2018)return true;
    if(y===2019&&((m===4&&n===1)||(m===9&&n===22)))return true;
    if(y===2020&&((m===6&&n===23)||(m===6&&n===24)||(m===7&&n===10)))return true;
    if(y===2021&&((m===6&&n===22)||(m===6&&n===23)||(m===7&&n===8)))return true;
    return false;
  }
  function holiday(d){
    if(!cfg.calHolidays)return false;
    if(baseHoliday(d))return true;
    var y=d.getFullYear();
    if(y>=1986&&baseHoliday(addDays(d,-1))&&baseHoliday(addDays(d,1)))return true;
    if(y>=1973){
      var p=addDays(d,-1),sawSunday=false;
      while(baseHoliday(p)){if(p.getDay()===0)sawSunday=true;p=addDays(p,-1);}
      if(sawSunday)return true;
    }
    return false;
  }

  function calGeom(i){
    var c=i%7,r=(i/7)|0,top=48,gh=H-top;
    return {c:c,x1:Math.floor(c*W/7),x2:Math.floor((c+1)*W/7)-1,y1:top+Math.floor(r*gh/5),y2:top+Math.floor((r+1)*gh/5)-1};
  }
  function selectedIndex(){if(!selectedDate)return -1;var n=dayNum(selectedDate)-dayNum(calStart);return n>=0&&n<35?n:-1;}
  function drawCalCell(i){
    if(i<0||i>=35)return;
    var q=calGeom(i),d=addDays(calStart,i),bg=BLACK,fg=WHITE;
    if(q.c===5)bg=BLUE;
    if(q.c===6||holiday(d))bg=RED;
    if(sameDay(d,new Date())){bg=GREEN;fg=BLACK;}
    if(selectedDate&&sameDay(d,selectedDate))fg=calBlinkWhite?WHITE:BLACK;
    g.setColor(bg).fillRect(q.x1,q.y1,q.x2,q.y2);
    g.setColor(fg).setBgColor(bg).setFont("Vector",18).setFontAlign(0,0).drawString(""+d.getDate(),(q.x1+q.x2)>>1,(q.y1+q.y2)>>1);
    g.setColor(GRAY).drawRect(q.x1,q.y1,q.x2,q.y2);
  }
  function calendarTopGap(){
    var spans=[];
    if(typeof WIDGETS!=="undefined")Object.keys(WIDGETS).forEach(function(k){
      var w=WIDGETS[k];if(!w||!w.width||!w.area||w.area.charAt(0)!=="t"||typeof w.x!=="number")return;
      spans.push([w.x,w.x+w.width-1]);
    });
    spans.sort(function(a,b){return a[0]-b[0];});
    var best=[0,W-1],bestW=0,pos=0;
    for(var i=0;i<spans.length;i++){var a=Math.max(0,spans[i][0]),b=Math.min(W-1,spans[i][1]);if(a>pos&&a-pos>bestW){best=[pos,a-1];bestW=a-pos;}if(b+1>pos)pos=b+1;}
    if(W-pos>bestW)best=[pos,W-1];
    return best;
  }
  function drawCalTop(){
    var text=calStart.getFullYear()+"/"+pad2(calStart.getMonth()+1),gap=calendarTopGap();
    var x1=gap[0]+1,x2=gap[1]-1;if(x2<x1){x1=gap[0];x2=gap[1];}
    g.setColor(BLACK).fillRect(x1,0,x2,23);
    var fs=13;g.setFont("Vector",fs);while(fs>8&&g.stringWidth(text)>x2-x1-2){fs--;g.setFont("Vector",fs);}
    g.setColor(WHITE).setBgColor(BLACK).setFontAlign(0,0).drawString(text,(x1+x2)>>1,11);
  }
  function armCalIdle(){
    clearTimer(calIdleTimer);calIdleTimer=undefined;
    if(mode!=="calendar"||!(cfg.calAutoReturn>0))return;
    calIdleTimer=setTimeout(function(){calIdleTimer=undefined;if(mode==="calendar")calendarToOrbit();},cfg.calAutoReturn*1000);
  }
  function drawCalendar(){
    mode="calendar";stopVisualTimers();showWidgets();setupCustomUI();
    g.reset().setBgColor(BLACK).setColor(BLACK).clear();showWidgets();
    var names=cfg.calEnglish?["M","T","W","T","F","S","S"]:["M","T","W","T","F","S","S"];
    for(var c=0;c<7;c++){
      var x1=Math.floor(c*W/7),x2=Math.floor((c+1)*W/7)-1,bg=c===5?BLUE:(c===6?RED:BLACK);
      g.setColor(bg).fillRect(x1,24,x2,47);
      g.setColor(WHITE).setBgColor(bg).setFont("Vector",17).setFontAlign(0,0).drawString(names[c],(x1+x2)>>1,35);
    }
    for(var i=0;i<35;i++)drawCalCell(i);
    drawCalTop();
    startCalBlink();armCalIdle();
  }
  function startCalBlink(){
    clearTimer(calBlinkTimer);calBlinkTimer=undefined;
    if(mode!=="calendar"||!selectedDate||!Bangle.isLCDOn())return;
    calBlinkTimer=setTimeout(function tick(){
      calBlinkTimer=undefined;if(mode!=="calendar"||!selectedDate||!Bangle.isLCDOn())return;
      calBlinkWhite=!calBlinkWhite;var i=selectedIndex();if(i>=0)drawCalCell(i);
      calBlinkTimer=setTimeout(tick,500);
    },500);
  }
  function dateAt(xy){
    if(!xy||xy.x<0||xy.x>=W||xy.y<48||xy.y>=H)return undefined;
    var c=Math.floor(xy.x*7/W),r=Math.floor((xy.y-48)*5/(H-48));
    if(c<0||c>6||r<0||r>4)return undefined;
    return addDays(calStart,r*7+c);
  }
  function selectDate(xy){
    var old=selectedIndex(),d=dateAt(xy);selectedDate=d?copyDay(d):undefined;calBlinkWhite=true;
    if(old>=0)drawCalCell(old);var ni=selectedIndex();if(ni>=0)drawCalCell(ni);startCalBlink();
  }
  function openCalendar(){
    transition();
    var focus=dayOffset?sceneDate():new Date();
    calStart=mondayOf(focus);
    if(dayOffset&&!selectedDate)selectedDate=copyDay(focus);
    drawCalendar();
  }
  function calendarToOrbit(){
    transition();
    if(selectedDate)dayOffset=dayNum(selectedDate)-dayNum(new Date());else dayOffset=0;
    drawOrbit();
  }

  function stopGPS(){
    clearTimer(gpsTimer);gpsTimer=undefined;
    if(gpsHandler){try{Bangle.removeListener("GPS",gpsHandler);}catch(e){}gpsHandler=undefined;}
    try{Bangle.setGPSPower(0,"orbclo");}catch(e){}
  }
  function startGPS(){
    stopGPS();transition();mode="settings";E.showMessage("Acquiring GPS...","Orbclo");
    gpsHandler=function(fix){
      if(!fix||!fix.fix||!isFinite(fix.lat)||!isFinite(fix.lon))return;
      cfg.preset=3;cfg.locLabel="GPS";cfg.manualLat=fix.lat;cfg.manualLon=fix.lon;cfg.lat=fix.lat;cfg.lon=fix.lon;saveCfg();stopGPS();
      try{Bangle.buzz(250);}catch(e){}
      E.showAlert("GPS saved\n"+fix.lat.toFixed(4)+"\n"+fix.lon.toFixed(4),"Orbclo").then(showSettings);
    };
    Bangle.on("GPS",gpsHandler);try{Bangle.setGPSPower(1,"orbclo");}catch(e){stopGPS();showSettings();return;}
    gpsTimer=setTimeout(function(){stopGPS();E.showAlert("GPS timeout","Orbclo").then(showSettings);},90000);
  }
  function applyPreset(v){
    cfg.preset=v;
    if(v<3){cfg.locLabel=presets[v][0];cfg.lat=presets[v][1];cfg.lon=presets[v][2];}
    else{cfg.locLabel="Manual";cfg.lat=cfg.manualLat;cfg.lon=cfg.manualLon;}
    saveCfg();scheduleEvents();
  }
  function showSettings(){
    transition();stopVisualTimers();hideWidgets();mode="settings";
    var menu={"":{title:"Orbclo 0.01"},
      "Back to Orbclo":function(){transition();drawOrbit();},
      "Location":{value:cfg.preset,min:0,max:3,step:1,format:function(v){return presets[v][0];},onchange:function(v){applyPreset(v);showSettings();}},
      "Get GPS":startGPS,
      "View":{value:cfg.viewSide,min:0,max:1,step:1,format:function(v){return v?"South":"North";},onchange:function(v){cfg.viewSide=v;saveCfg();}},
      "Earth map":{value:!!cfg.earthMap,onchange:function(v){cfg.earthMap=!!v;saveCfg();}},
      "Sun size":{value:cfg.sunSize,min:3,max:12,step:1,onchange:function(v){cfg.sunSize=v;saveCfg();}},
      "Earth size":{value:cfg.earthSize,min:10,max:42,step:1,onchange:function(v){cfg.earthSize=v;saveCfg();}},
      "Moon size":{value:cfg.moonSize,min:3,max:15,step:1,onchange:function(v){cfg.moonSize=v;saveCfg();}},
      "Marker size":{value:cfg.markerSize,min:1,max:4,step:1,onchange:function(v){cfg.markerSize=v;saveCfg();}},
      "Solar buzz":{value:!!cfg.buzzEvents,onchange:function(v){cfg.buzzEvents=!!v;saveCfg();scheduleEvents();}},
      "Holiday red":{value:!!cfg.calHolidays,onchange:function(v){cfg.calHolidays=!!v;saveCfg();}},
      "Cal return s":{value:cfg.calAutoReturn,min:15,max:120,step:15,onchange:function(v){cfg.calAutoReturn=v;saveCfg();}}
    };
    if(cfg.preset===3){
      menu["Latitude"]={value:cfg.manualLat,min:-90,max:90,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){cfg.locLabel="Manual";cfg.manualLat=v;cfg.lat=v;saveCfg();scheduleEvents();}};
      menu["Longitude"]={value:cfg.manualLon,min:-180,max:180,step:0.001,format:function(v){return v.toFixed(3);},onchange:function(v){cfg.locLabel="Manual";cfg.manualLon=v;cfg.lon=v;saveCfg();scheduleEvents();}};
    }
    menu["Screenshots"]=function(){var st=Storage.readJSON(SHOTSTATE,1)||{count:0};E.showAlert((st.count||0)+" / "+SHOTMAX,"Orbclo shots").then(showSettings);};
    menu["Delete shots"]=function(){E.showPrompt("Delete screenshots?",{title:"Orbclo"}).then(function(ok){if(ok){for(var i=0;i<SHOTMAX;i++)Storage.erase(shotName(i));Storage.erase(SHOTSTATE);}showSettings();});};
    E.showMenu(menu);
  }

  function shotName(i){return "oc"+(i<10?"0":"")+i+".bmp";}
  function saveShot(){
    if(mode!=="orbit")return;
    try{
      var bmp=g.asBMP();if(!bmp)return;
      var st=Storage.readJSON(SHOTSTATE,1)||{next:0,count:0};
      var n=(st.next|0)%SHOTMAX;Storage.write(shotName(n),bmp);st.next=(n+1)%SHOTMAX;st.count=Math.min(SHOTMAX,(st.count|0)+1);Storage.writeJSON(SHOTSTATE,st);Bangle.buzz(100);
    }catch(e){}
  }

  function solarTimesForDate(d){
    var noon=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12,0,0,0), sd=solarData(noon);
    var setting=Storage.readJSON("setting.json",1)||{}, tz=isFinite(setting.timezone)?setting.timezone:0;
    var solarNoonUTC=720-4*cfg.lon-sd.eq;
    var sunriseUTC=solarNoonUTC-4*sd.h0, sunsetUTC=solarNoonUTC+4*sd.h0;
    var base=new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0,0);
    return {sunrise:new Date(base.valueOf()+(sunriseUTC+tz*60)*60000),sunset:new Date(base.valueOf()+(sunsetUTC+tz*60)*60000)};
  }
  function scheduleEvents(){
    clearTimer(eventTimer);eventTimer=undefined;if(!cfg.buzzEvents||killed)return;
    var now=new Date(), candidates=[];
    for(var k=0;k<2;k++){
      var d=addDays(now,k), st=solarTimesForDate(d);
      candidates.push(new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0,0));
      candidates.push(new Date(d.getFullYear(),d.getMonth(),d.getDate(),12,0,0,0));
      candidates.push(st.sunrise);candidates.push(st.sunset);
    }
    var best=null;for(var i=0;i<candidates.length;i++)if(candidates[i]>now&&(!best||candidates[i]<best))best=candidates[i];
    if(!best)return;
    eventTimer=setTimeout(function(){eventTimer=undefined;try{Bangle.buzz(7000);}catch(e){}eventTimer=setTimeout(scheduleEvents,60000);},Math.max(1000,best-now));
  }

  function orbitTap(){
    tapCount++;
    if(tapCount===1){
      clearTimer(tapTimer);tapTimer=setTimeout(function(){tapTimer=undefined;tapCount=0;if(mode==="orbit")openCalendar();},400);
    }else{
      clearTimer(tapTimer);tapTimer=undefined;tapCount=0;if(mode==="orbit")showSettings();
    }
  }
  function calendarTap(xy){
    armCalIdle();tapCount++;tapXY=xy;
    if(tapCount===1){
      clearTimer(tapTimer);tapTimer=setTimeout(function(){tapTimer=undefined;tapCount=0;tapXY=undefined;if(mode==="calendar")calendarToOrbit();},400);
    }else{
      var p=tapXY;clearTimer(tapTimer);tapTimer=undefined;tapCount=0;tapXY=undefined;if(mode==="calendar")selectDate(p);
    }
  }
  function onTouch(btn,xy){
    if(killed||!Bangle.isLCDOn())return;
    if(mode==="orbit"){if(Bangle.isLocked&&Bangle.isLocked())return;orbitTap();}
    else if(mode==="calendar")calendarTap(xy);
  }
  function onSwipe(lr,ud){
    if(mode==="calendar"&&ud){stopTap();armCalIdle();calStart=addDays(calStart,ud<0?35:-35);drawCalendar();}
    else if(mode==="orbit")saveShot();
  }
  function onLCD(on){
    if(!on){stopVisualTimers();stopGPS();selectedDate=undefined;dayOffset=0;calStart=undefined;mode="orbit";return;}
    selectedDate=undefined;dayOffset=0;calStart=undefined;drawOrbit();
  }
  function exitApp(){if(killed)return;transition();cleanup();Bangle.showLauncher();}
  function cleanup(){
    if(killed)return;killed=true;stopVisualTimers();clearTimer(eventTimer);eventTimer=undefined;stopGPS();
    try{Bangle.removeListener("touch",onTouch);}catch(e){}
    try{Bangle.removeListener("swipe",onSwipe);}catch(e){}
    try{Bangle.removeListener("lcdPower",onLCD);}catch(e){}
    if(buttonWatch){clearWatch(buttonWatch);buttonWatch=undefined;}
    try{require("widget_utils").show();}catch(e){}
  }

  Bangle.on("touch",onTouch);Bangle.on("swipe",onSwipe);Bangle.on("lcdPower",onLCD);
  buttonWatch=setWatch(exitApp,BTN1,{repeat:true,edge:"rising",debounce:30});
  E.on("kill",cleanup);
  scheduleEvents();
  drawOrbit();
})();
