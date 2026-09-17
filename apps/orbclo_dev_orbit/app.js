/* Orbclo Dev Orbit 0.04 - isolated main-screen with proven input path */
(function(){
  var Storage=require("Storage"),W=g.getWidth(),H=g.getHeight();
  var BLACK=0x0000,WHITE=0xFFFF,NAVY=0x000F,CYAN=0x07FF,YELLOW=0xFFE0,ORANGE=0xFD20,
      RED=0xF800,GREEN=0x07E0,MAGENTA=0xF81F,GRAY=0x7BEF,DARKBLUE=0x0008;
  var DEG=Math.PI/180,DAY=86400000,SYNODIC=29.530588853;
  var cfg=Storage.readJSON("orbclo_orbitdev.json",1)||{};
  function def(k,v){if(cfg[k]===undefined)cfg[k]=v;}
  def("lat",35.694);def("lon",139.754);def("locLabel","Chiyoda");def("viewSide",0);
  def("sunSize",6);def("earthSize",30);def("moonSize",9);def("markerSize",2);

  var busy=false,killed=false,touchCount=0;
  var transitionTimer,minuteTimer,sceneTimer,unlockTimer;

  function clear(t){if(t)clearTimeout(t);}
  function pad(n){return n<10?"0"+n:""+n;}
  function clamp(v,a,b){return v<a?a:(v>b?b:v);}
  function norm(v){v%=360;if(v<0)v+=360;return v;}

  function solarData(d){
    var y=d.getFullYear();
    var start=new Date(y,0,0,0,0,0,0).valueOf();
    var today=new Date(y,d.getMonth(),d.getDate(),0,0,0,0).valueOf();
    var n=Math.max(1,Math.round((today-start)/DAY));
    var hour=d.getHours()+d.getMinutes()/60+d.getSeconds()/3600;
    var ga=2*Math.PI/365*(n-1+(hour-12)/24);
    var eq=229.18*(0.000075+0.001868*Math.cos(ga)-0.032077*Math.sin(ga)-0.014615*Math.cos(2*ga)-0.040849*Math.sin(2*ga));
    var dec=0.006918-0.399912*Math.cos(ga)+0.070257*Math.sin(ga)-0.006758*Math.cos(2*ga)+0.000907*Math.sin(2*ga)-0.002697*Math.cos(3*ga)+0.00148*Math.sin(3*ga);
    var tz=(d.getTimezoneOffset()/-60),localMin=d.getHours()*60+d.getMinutes()+d.getSeconds()/60;
    var solarMin=localMin+eq+4*(cfg.lon-15*tz);
    var ha=norm(solarMin/4-180);if(ha>180)ha-=360;
    var c=(Math.sin(-0.833*DEG)-Math.sin(cfg.lat*DEG)*Math.sin(dec))/(Math.cos(cfg.lat*DEG)*Math.cos(dec));
    return {ha:ha,h0:c<=-1?180:(c>=1?0:Math.acos(c)/DEG)};
  }

  function moonPhase(d){
    var epoch=Date.UTC(2000,0,6,18,14,0),p=((d.valueOf()-epoch)/DAY/SYNODIC)%1;
    return p<0?p+1:p;
  }

  function drawHeader(){
    var d=new Date(),bat=E.getBattery();
    var left=pad(d.getMonth()+1)+"/"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes());
    var right=bat+"%";
    g.setColor(WHITE).fillRect(0,0,W-1,23);
    g.setFont("Vector",12).setBgColor(WHITE);
    g.setFontAlign(-1,0).setColor(BLACK).drawString(left,3,11);
    g.setFontAlign(1,0).setColor(bat<=20?RED:BLACK).drawString(right,W-3,11);
  }

  function fillLitHalf(cx,cy,r,ux,uy,col){
    g.setColor(col);
    for(var yy=-r;yy<=r;yy++){
      var span=Math.floor(Math.sqrt(Math.max(0,r*r-yy*yy))),x0=-span,x1=span;
      if(Math.abs(ux)<0.0001){if(yy*uy<0)continue;}
      else{
        var cut=-yy*uy/ux;
        if(ux>0)x0=Math.max(x0,Math.ceil(cut));else x1=Math.min(x1,Math.floor(cut));
      }
      if(x0<=x1)g.drawLine(cx+x0,cy+yy,cx+x1,cy+yy);
    }
  }

  function drawMoon(cx,cy,r,p){
    g.setColor(DARKBLUE).fillCircle(cx,cy,r);
    g.setColor(YELLOW);
    var k=Math.cos(2*Math.PI*p);
    for(var yy=-r;yy<=r;yy++){
      var span=Math.sqrt(Math.max(0,r*r-yy*yy)),x1,x2;
      if(p<=0.5){x1=k*span;x2=span;}else{x1=-span;x2=-k*span;}
      if(x2>=x1)g.drawLine(cx+Math.ceil(x1),cy+yy,cx+Math.floor(x2),cy+yy);
    }
    g.setColor(WHITE).drawCircle(cx,cy,r);
  }

  function drawScene(){
    busy=true;
    g.reset().setBgColor(BLACK).setColor(BLACK).clear();
    var d=new Date(),sd=solarData(d),side=cfg.viewSide?-1:1;
    var sx=W-27,sy=51,ex=55,ey=117;
    var sunAng=Math.atan2(sy-ey,sx-ex),obs=sunAng+side*sd.ha*DEG;
    var er=clamp(cfg.earthSize,12,42),sr=clamp(cfg.sunSize,3,12),mr=clamp(cfg.moonSize,3,14);

    g.setColor(WHITE).drawLine(ex,ey,sx,sy);
    g.setColor(YELLOW).drawLine(ex,ey,ex+(er+12)*Math.cos(sunAng+side*sd.h0*DEG),ey+(er+12)*Math.sin(sunAng+side*sd.h0*DEG));
    g.setColor(ORANGE).drawLine(ex,ey,ex+(er+12)*Math.cos(sunAng-side*sd.h0*DEG),ey+(er+12)*Math.sin(sunAng-side*sd.h0*DEG));

    g.setColor(ORANGE);
    for(var i=0;i<8;i++){
      var a=i*Math.PI/4;
      g.drawLine(sx+Math.cos(a)*(sr+1),sy+Math.sin(a)*(sr+1),sx+Math.cos(a)*(sr+4),sy+Math.sin(a)*(sr+4));
    }
    g.setColor(YELLOW).fillCircle(sx,sy,sr);

    g.setColor(BLACK).fillCircle(ex,ey,er);
    fillLitHalf(ex,ey,er,Math.cos(sunAng),Math.sin(sunAng),CYAN);
    g.setColor(CYAN).drawCircle(ex,ey,er);

    /* Lightweight reference coastline, intentionally simple in this isolated stage */
    g.setColor(WHITE);
    g.drawLine(ex-18,ey-13,ex-9,ey-20);g.drawLine(ex-9,ey-20,ex+1,ey-17);
    g.drawLine(ex+1,ey-17,ex+12,ey-10);g.drawLine(ex+12,ey-10,ex+19,ey-2);
    g.drawLine(ex-11,ey+3,ex-4,ey+9);g.drawLine(ex-4,ey+9,ex-7,ey+18);

    var ox=ex+er*Math.cos(obs),oy=ey+er*Math.sin(obs),tx=-Math.sin(obs),ty=Math.cos(obs);
    g.setColor(MAGENTA).drawLine(ox-tx*(er+3),oy-ty*(er+3),ox+tx*(er+3),oy+ty*(er+3));
    g.setColor(GREEN).drawLine(ox,oy,ox+18*Math.cos(obs),oy+18*Math.sin(obs));
    g.setColor(RED).fillCircle(ox,oy,clamp(cfg.markerSize,1,4));

    var phase=moonPhase(d),orbitR=er+mr+17,ma=sunAng+side*phase*2*Math.PI;
    var mx=ex+orbitR*Math.cos(ma),my=ey+orbitR*Math.sin(ma);
    g.setColor(GRAY).drawCircle(ex,ey,orbitR);
    drawMoon(mx,my,mr,phase);

    g.setColor(WHITE).setBgColor(BLACK).setFont("6x8",1).setFontAlign(1,1).drawString(cfg.locLabel,W-2,H-2);
    drawHeader();
    try{g.flip();}catch(e){}
    busy=false;
  }

  function showTouch(){
    touchCount++;
    busy=true;
    g.reset().setBgColor(NAVY).setColor(NAVY).clear();
    g.setColor(WHITE).setBgColor(NAVY).setFont("Vector",22).setFontAlign(0,0).drawString("TOUCH "+touchCount,W>>1,H>>1);
    try{g.flip();}catch(e){}
    clear(transitionTimer);
    transitionTimer=setTimeout(function(){transitionTimer=undefined;if(!killed)drawScene();},350);
  }

  function onTouch(){if(!killed&&!busy)showTouch();}

  function onLock(isLocked){
    if(!isLocked||killed||!Bangle.isLCDOn())return;
    clear(unlockTimer);
    unlockTimer=setTimeout(function(){unlockTimer=undefined;if(!killed&&Bangle.isLCDOn())try{Bangle.setLocked(false);}catch(e){}},0);
  }

  function onLCD(on){
    clear(minuteTimer);minuteTimer=undefined;
    clear(sceneTimer);sceneTimer=undefined;
    if(!on||killed){busy=false;return;}
    try{Bangle.setLocked(false);}catch(e){}
    drawScene();armTimers();
  }

  function armTimers(){
    clear(minuteTimer);
    minuteTimer=setTimeout(function(){minuteTimer=undefined;if(!killed&&Bangle.isLCDOn()){drawHeader();try{g.flip();}catch(e){}armTimers();}},60000-(Date.now()%60000)+25);
    clear(sceneTimer);
    sceneTimer=setTimeout(function(){sceneTimer=undefined;if(!killed&&Bangle.isLCDOn()){drawScene();armTimers();}},300000-(Date.now()%300000)+50);
  }

  function cleanup(){
    if(killed)return;killed=true;
    clear(transitionTimer);clear(minuteTimer);clear(sceneTimer);clear(unlockTimer);
    try{Bangle.removeListener("lock",onLock);}catch(e){}
    try{Bangle.removeListener("lcdPower",onLCD);}catch(e){}
  }

  try{Bangle.setUI({mode:"custom",touch:onTouch,btn:function(){if(!busy)Bangle.showLauncher();},remove:cleanup});}catch(e){}
  Bangle.on("lock",onLock);Bangle.on("lcdPower",onLCD);
  try{Bangle.setLocked(false);}catch(e){}
  drawScene();armTimers();
})();
