/* Orbclo Dev Orbit 0.14 - solar position calculation stage */
(function(){
  var W=g.getWidth(),H=g.getHeight();
  var BLACK=0x0000,WHITE=0xFFFF,NAVY=0x000F,DARKBLUE=0x0008,CYAN=0x07FF,YELLOW=0xFFE0,ORANGE=0xFD20,RED=0xF800;
  var busy=false,killed=false,touchCount=0,transitionTimer,minuteTimer,unlockTimer;
  var SUNX=W-28,SUNY=52,EARTHX=54,EARTHY=116,EARTHR=30;
  var TESTLAT=35.694,TESTLON=139.754;
  var NIGHTPOLY=[],TERM=[];

  function clear(t){if(t)clearTimeout(t);}
  function pad(n){return n<10?"0"+n:""+n;}
  function ms(a,b){return Math.round((b-a)*1000);}
  function rad(d){return d*Math.PI/180;}
  function deg(r){return r*180/Math.PI;}

  function dayOfYear(d){
    var md=[0,31,59,90,120,151,181,212,243,273,304,334];
    var n=md[d.getMonth()]+d.getDate();
    var y=d.getFullYear();
    if(d.getMonth()>1 && ((y%4===0 && y%100!==0)||y%400===0))n++;
    return n;
  }

  function solarPosition(d,lat,lon){
    var n=dayOfYear(d);
    var hour=d.getHours()+d.getMinutes()/60+d.getSeconds()/3600;
    var g0=2*Math.PI/365*(n-1+(hour-12)/24);
    var eq=229.18*(0.000075+0.001868*Math.cos(g0)-0.032077*Math.sin(g0)
      -0.014615*Math.cos(2*g0)-0.040849*Math.sin(2*g0));
    var dec=0.006918-0.399912*Math.cos(g0)+0.070257*Math.sin(g0)
      -0.006758*Math.cos(2*g0)+0.000907*Math.sin(2*g0)
      -0.002697*Math.cos(3*g0)+0.00148*Math.sin(3*g0);
    var tz=0;
    try{tz=-d.getTimezoneOffset()/60;}catch(e){}
    var tst=hour*60+eq+4*lon-60*tz;
    while(tst<0)tst+=1440;
    while(tst>=1440)tst-=1440;
    var ha=rad(tst/4-180),la=rad(lat);
    var sinEl=Math.sin(la)*Math.sin(dec)+Math.cos(la)*Math.cos(dec)*Math.cos(ha);
    if(sinEl>1)sinEl=1;
    if(sinEl<-1)sinEl=-1;
    var el=deg(Math.asin(sinEl));
    var az=deg(Math.atan2(Math.sin(ha),Math.cos(ha)*Math.sin(la)-Math.tan(dec)*Math.cos(la)))+180;
    if(az<0)az+=360;
    if(az>=360)az-=360;
    return {az:az,el:el};
  }

  function safeSolar(){
    try{return solarPosition(new Date(),TESTLAT,TESTLON);}
    catch(e){return {az:0,el:-99};}
  }

  function buildEarthGeometry(){
    var dx=SUNX-EARTHX,dy=SUNY-EARTHY;
    var len=Math.sqrt(dx*dx+dy*dy);
    var nightA=Math.atan2(-dy,-dx);
    for(var i=0;i<=12;i++){
      var a=nightA-Math.PI/2+i*Math.PI/12;
      NIGHTPOLY.push(
        Math.round(EARTHX+Math.cos(a)*EARTHR),
        Math.round(EARTHY+Math.sin(a)*EARTHR)
      );
    }
    var tx=-dy/len,ty=dx/len;
    TERM=[
      Math.round(EARTHX-tx*(EARTHR-1)),Math.round(EARTHY-ty*(EARTHR-1)),
      Math.round(EARTHX+tx*(EARTHR-1)),Math.round(EARTHY+ty*(EARTHR-1))
    ];
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

  function drawSun(){
    var r=6;
    g.setColor(ORANGE);
    for(var i=0;i<8;i++){
      var a=i*Math.PI/4;
      g.drawLine(Math.round(SUNX+Math.cos(a)*(r+1)),Math.round(SUNY+Math.sin(a)*(r+1)),Math.round(SUNX+Math.cos(a)*(r+4)),Math.round(SUNY+Math.sin(a)*(r+4)));
    }
    g.setColor(YELLOW).fillCircle(SUNX,SUNY,r);
  }

  function drawEarth(){
    g.setColor(CYAN).fillCircle(EARTHX,EARTHY,EARTHR);
    g.setColor(DARKBLUE).fillPoly(NIGHTPOLY);
    g.setColor(WHITE).drawLine(TERM[0],TERM[1],TERM[2],TERM[3]);
    g.setColor(WHITE).drawCircle(EARTHX,EARTHY,EARTHR);
  }

  function drawBase(){
    var t0=getTime();
    g.reset().setBgColor(BLACK).setColor(BLACK).clear();
    var t1=getTime();
    drawSun();
    var t2=getTime();
    var sol=safeSolar();
    var t3=getTime();
    drawEarth();
    var t4=getTime();
    drawHeader();
    var t5=getTime();

    var c=ms(t0,t1),s=ms(t1,t2),a=ms(t2,t3),e=ms(t3,t4),h=ms(t4,t5),tot=ms(t0,t5);
    g.setColor(WHITE).setBgColor(BLACK).setFont("6x8",1).setFontAlign(0,0);
    g.drawString("Az"+Math.round(sol.az)+" El"+Math.round(sol.el),W>>1,H-22);
    g.drawString("C"+c+" S"+s+" A"+a+" E"+e+" H"+h+" T"+tot,W>>1,H-10);
    try{g.flip();}catch(err){}
    busy=false;
  }

  function showTouch(){
    touchCount++;
    busy=true;
    g.reset().setBgColor(NAVY).setColor(NAVY).clear();
    g.setColor(WHITE).setBgColor(NAVY).setFont("Vector",24).setFontAlign(0,0).drawString("TOUCH "+touchCount,W>>1,H>>1);
    try{g.flip();}catch(e){}
    clear(transitionTimer);
    transitionTimer=setTimeout(function(){transitionTimer=undefined;if(!killed)drawBase();},80);
  }

  function onTouch(){
    if(killed||busy)return;
    showTouch();
  }

  function onLock(isLocked){
    if(!isLocked||killed)return;
    clear(unlockTimer);
    unlockTimer=setTimeout(function(){unlockTimer=undefined;if(!killed)try{Bangle.setLocked(false);}catch(e){}},0);
  }

  function armMinute(){
    clear(minuteTimer);
    minuteTimer=setTimeout(function(){
      minuteTimer=undefined;
      if(!killed){drawBase();armMinute();}
    },60000-(Date.now()%60000)+25);
  }

  function cleanup(){
    if(killed)return;
    killed=true;
    clear(transitionTimer);clear(minuteTimer);clear(unlockTimer);
    try{Bangle.removeListener("lock",onLock);}catch(e){}
  }

  buildEarthGeometry();
  try{Bangle.setUI({mode:"custom",touch:onTouch,btn:function(){if(!busy)Bangle.showLauncher();},remove:cleanup});}catch(e){}
  Bangle.on("lock",onLock);
  try{Bangle.setLocked(false);}catch(e){}
  drawBase();
  armMinute();
})();
