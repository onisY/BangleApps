/* Orbclo Dev Orbit 0.02 - isolated main-screen test */
(function(){
  var Storage=require("Storage"),W=g.getWidth(),H=g.getHeight();
  var BLACK=0,WHITE=0xFFFF,NAVY=0x000F,CYAN=0x07FF,YELLOW=0xFFE0,GRAY=0x7BEF,RED=0xF800,GREEN=0x07E0,MAGENTA=0xF81F,DARKBLUE=0x0008;
  var DEG=Math.PI/180,DAY=86400000,SYNODIC=29.530588853;
  var cfg=Storage.readJSON("orbclo_orbitdev.json",1)||{};
  function def(k,v){if(cfg[k]===undefined)cfg[k]=v;}
  def("lat",35.694);def("lon",139.754);def("locLabel","Chiyoda");def("viewSide",0);def("sunSize",6);def("earthSize",30);def("moonSize",9);def("markerSize",2);def("earthMap",true);

  var minuteTimer,sceneTimer,buttonWatch,transitionTimer,releaseTimer;
  var inputBusy=false,killed=false;

  function clear(t){if(t)clearTimeout(t);}
  function lock(){inputBusy=true;clear(releaseTimer);releaseTimer=undefined;}
  function unlockSoon(){clear(releaseTimer);releaseTimer=setTimeout(function(){releaseTimer=undefined;inputBusy=false;},150);}
  function pad(n){return n<10?"0"+n:""+n;}
  function clamp(v,a,b){return v<a?a:v>b?b:v;}

  function solarData(d){
    var y=d.getFullYear(),start=new Date(y,0,0).valueOf(),now=new Date(y,d.getMonth(),d.getDate()).valueOf();
    var n=Math.max(1,Math.round((now-start)/DAY)),hour=(d.valueOf()%DAY+DAY)%DAY/3600000;
    var ga=2*Math.PI/365*(n-1+(hour-12)/24);
    var eq=229.18*(0.000075+0.001868*Math.cos(ga)-0.032077*Math.sin(ga)-0.014615*Math.cos(2*ga)-0.040849*Math.sin(2*ga));
    var dec=0.006918-0.399912*Math.cos(ga)+0.070257*Math.sin(ga)-0.006758*Math.cos(2*ga)+0.000907*Math.sin(2*ga)-0.002697*Math.cos(3*ga)+0.00148*Math.sin(3*ga);
    var utc=((d.valueOf()/60000)%1440+1440)%1440,ha=(utc+eq+4*cfg.lon)/4-180;
    while(ha>180)ha-=360;while(ha<-180)ha+=360;
    var c=(Math.sin(-0.833*DEG)-Math.sin(cfg.lat*DEG)*Math.sin(dec))/(Math.cos(cfg.lat*DEG)*Math.cos(dec));
    return {ha:ha,h0:c<=-1?180:(c>=1?0:Math.acos(c)/DEG)};
  }

  function moonPhase(d){
    var e=Date.UTC(2000,0,6,18,14),p=((d.valueOf()-e)/DAY/SYNODIC)%1;
    return p<0?p+1:p;
  }

  function drawMoon(cx,cy,r,p){
    g.setColor(DARKBLUE).fillCircle(cx,cy,r);
    g.setColor(YELLOW);
    var k=Math.cos(2*Math.PI*p);
    for(var y=-r;y<=r;y++){
      var s=Math.sqrt(Math.max(0,r*r-y*y)),x1,x2;
      if(p<=.5){x1=k*s;x2=s;}else{x1=-s;x2=-k*s;}
      if(x2>=x1)g.drawLine(cx+Math.ceil(x1),cy+y,cx+Math.floor(x2),cy+y);
    }
    g.setColor(WHITE).drawCircle(cx,cy,r);
  }

  function drawHeader(){
    var d=new Date(),bat=E.getBattery();
    var dateTime=pad(d.getMonth()+1)+"/"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes());
    var batText=bat+"%";
    g.setColor(NAVY).fillRect(0,0,W-1,23);
    g.setFont("Vector",12).setBgColor(NAVY);
    g.setFontAlign(-1,0).setColor(WHITE).drawString(dateTime,3,11);
    g.setFontAlign(1,0).setColor(bat<=20?RED:WHITE).drawString(batText,W-3,11);
    try{g.flip();}catch(e){}
  }

  function drawScene(){
    lock();
    g.reset().setBgColor(BLACK).setColor(BLACK).clear();
    var d=new Date(),sd=solarData(d),side=cfg.viewSide?-1:1,sx=W-24,sy=48,ex=55,ey=119;
    var sunAng=Math.atan2(sy-ey,sx-ex),obs=sunAng+side*sd.ha*DEG;
    var er=clamp(cfg.earthSize,8,48),sr=clamp(cfg.sunSize,3,15),mr=clamp(cfg.moonSize,3,18),ray=er+10;

    g.setColor(WHITE).drawLine(ex,ey,sx,sy);
    g.setColor(YELLOW).fillCircle(sx,sy,sr);
    g.setColor(CYAN).fillCircle(ex,ey,er);
    g.setColor(BLACK);
    for(var yy=-er;yy<=er;yy++){
      var span=Math.sqrt(Math.max(0,er*er-yy*yy));
      var th=-yy*Math.sin(sunAng)/(Math.cos(sunAng)||0.0001);
      var a=Math.ceil(-span),b=Math.min(Math.floor(span),Math.floor(th));
      if(b>=a)g.drawLine(ex+a,ey+yy,ex+b,ey+yy);
    }
    g.setColor(CYAN).drawCircle(ex,ey,er);
    g.setColor(YELLOW).drawLine(ex,ey,ex+ray*Math.cos(sunAng+side*sd.h0*DEG),ey+ray*Math.sin(sunAng+side*sd.h0*DEG));
    g.setColor(0xFD20).drawLine(ex,ey,ex+ray*Math.cos(sunAng-side*sd.h0*DEG),ey+ray*Math.sin(sunAng-side*sd.h0*DEG));

    var ox=ex+er*Math.cos(obs),oy=ey+er*Math.sin(obs),tx=-Math.sin(obs),ty=Math.cos(obs);
    g.setColor(MAGENTA).drawLine(ox-tx*(er+4),oy-ty*(er+4),ox+tx*(er+4),oy+ty*(er+4));
    g.setColor(GREEN).drawLine(ox,oy,ox+18*Math.cos(obs),oy+18*Math.sin(obs));
    g.setColor(RED).fillCircle(ox,oy,clamp(cfg.markerSize,1,4));

    var p=moonPhase(d),or=er+mr+17,ma=sunAng+side*p*2*Math.PI,mx=ex+or*Math.cos(ma),my=ey+or*Math.sin(ma);
    g.setColor(GRAY).drawCircle(ex,ey,or);
    drawMoon(mx,my,mr,p);

    g.setFont("6x8",1).setFontAlign(1,1).setColor(WHITE).setBgColor(BLACK).drawString(cfg.locLabel,W-2,H-2);
    drawHeader();
    unlockSoon();
  }

  function showNavy(){
    g.reset().setBgColor(NAVY).setColor(NAVY).clear();
    try{g.flip();}catch(e){}
  }

  function onTouch(){
    if(killed||inputBusy)return;
    lock();
    showNavy();
    clear(transitionTimer);
    transitionTimer=setTimeout(function(){transitionTimer=undefined;if(!killed)drawScene();},300);
  }

  function armTimers(){
    clear(minuteTimer);
    minuteTimer=setTimeout(function(){minuteTimer=undefined;if(!killed&&Bangle.isLCDOn())drawHeader();armTimers();},60000-(Date.now()%60000)+20);
    clear(sceneTimer);
    sceneTimer=setTimeout(function(){sceneTimer=undefined;if(!killed&&Bangle.isLCDOn())drawScene();armTimers();},300000-(Date.now()%300000)+40);
  }

  function cleanup(){
    if(killed)return;
    killed=true;
    clear(minuteTimer);clear(sceneTimer);clear(transitionTimer);clear(releaseTimer);
    if(buttonWatch){clearWatch(buttonWatch);buttonWatch=undefined;}
  }

  try{Bangle.setUI({mode:"custom",touch:onTouch,remove:cleanup});}catch(e){}
  buttonWatch=setWatch(function(){if(inputBusy)return;cleanup();Bangle.showLauncher();},BTN1,{repeat:true,edge:"rising",debounce:30});
  E.on("kill",cleanup);
  drawScene();
  armTimers();
})();
