/* Orbclo Dev Orbit 0.28 - Moon phase + unobstructed diagnostics */
(function(){
  var W=g.getWidth(),H=g.getHeight();
  var BLACK=0x0000,WHITE=0xFFFF,NAVY=0x000F,DARKBLUE=0x0008,CYAN=0x07FF,YELLOW=0xFFE0,ORANGE=0xFD20,RED=0xF800;
  var busy=false,killed=false,touchCount=0,transitionTimer,minuteTimer,secondTimer,unlockTimer;
  var colonX=0,colonVisible=true;
  var SUNX=W-28,SUNY=52,EARTHX=54,EARTHY=116,EARTHR=30;
  var MOONORBIT=44,MOONR=7,SYNODIC=29.530588853,NEWMOON=947182440000;
  var TESTLAT=35.694,TESTLON=139.754;
  var LIGHTSPAN=[],LIGHTBX=[],LIGHTBY=[],LIGHTLIMB=[],LIGHTSTEPS=6,LUX=0,LUY=0,LVX=0,LVY=0;

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
    return {az:az,el:el,ha:ha,dec:dec};
  }

  function safeSolar(){
    try{return solarPosition(new Date(),TESTLAT,TESTLON);}
    catch(e){return {az:0,el:-99,ha:0,dec:0};}
  }

  function buildLightingCache(){
    LIGHTSPAN=[];LIGHTBX=[];LIGHTBY=[];LIGHTLIMB=[];
    var a=Math.atan2(SUNY-EARTHY,SUNX-EARTHX);
    LUX=Math.cos(a);LUY=Math.sin(a);
    LVX=-LUY;LVY=LUX;

    for(var i=0;i<=LIGHTSTEPS;i++){
      var v=-EARTHR+2*EARTHR*i/LIGHTSTEPS;
      var span=Math.sqrt(Math.max(0,EARTHR*EARTHR-v*v));
      LIGHTSPAN.push(span);

      /* Base point on the v axis; only the declination-dependent u offset changes later. */
      LIGHTBX.push(EARTHX+LVX*v);
      LIGHTBY.push(EARTHY+LVY*v);

      /* Static anti-solar limb point used to close the night polygon. */
      LIGHTLIMB.push(
        Math.round(EARTHX-LUX*span+LVX*v),
        Math.round(EARTHY-LUY*span+LVY*v)
      );
    }
  }

  function drawBoldSpaced(str,x,y,advance,color){
    g.setBgColor(WHITE).setColor(color).setFont("12x20").setFontAlign(-1,-1);
    for(var i=0;i<str.length;i++){
      var xx=x+i*advance;
      g.drawString(str[i],xx,y);
      g.drawString(str[i],xx+1,y);
    }
    return x+(str.length?((str.length-1)*advance+13):0);
  }

  function drawHeader(){
    var d=new Date(),bat=E.getBattery();
    var pre=pad(d.getMonth()+1)+"/"+pad(d.getDate())+" "+pad(d.getHours());
    var post=pad(d.getMinutes());
    var x=1,adv=13;

    g.setColor(WHITE).fillRect(0,0,W-1,23);

    x=drawBoldSpaced(pre,x,2,adv,BLACK);
    colonX=x;
    colonVisible=(d.getSeconds()%2)===0;
    if(colonVisible){
      g.setBgColor(WHITE).setColor(BLACK).setFont("12x20").setFontAlign(-1,-1);
      g.drawString(":",colonX,2);
      g.drawString(":",colonX+1,2);
    }
    x=colonX+adv;
    var timeEnd=drawBoldSpaced(post,x,2,adv,BLACK);

    /* Fit battery into the measured remaining width so 100% can never overlap time. */
    var btxt=bat+"%",bsize=16,bcol=bat<=20?RED:BLACK;
    g.setFont("Vector",bsize);
    while(bsize>10 && g.stringWidth(btxt)>W-3-(timeEnd+2)){
      bsize--;
      g.setFont("Vector",bsize);
    }
    g.setBgColor(WHITE).setColor(bcol).setFontAlign(1,0);
    g.drawString(btxt,W-2,11);
    g.drawString(btxt,W-3,11);
  }

  function drawColon(show){
    if(killed||busy)return;
    g.setColor(WHITE).fillRect(colonX,2,colonX+12,21);
    if(show){
      g.setBgColor(WHITE).setColor(BLACK).setFont("12x20").setFontAlign(-1,-1);
      g.drawString(":",colonX,2);
      g.drawString(":",colonX+1,2);
    }
    colonVisible=show;
  }

  function armSecond(){
    clear(secondTimer);
    secondTimer=setTimeout(function(){
      secondTimer=undefined;
      if(!killed){
        var show=(new Date().getSeconds()%2)===0;
        if(show!==colonVisible)drawColon(show);
        armSecond();
      }
    },1000-(Date.now()%1000)+20);
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

  function buildLighting(dec){
    var sd=Math.sin(dec);
    var term=[],night=[];
    var i,u,x,y;

    /* Only seven terminator points are needed at a 30 px Earth radius.
       Direction, base coordinates and night-side limb are all cached. */
    for(i=0;i<=LIGHTSTEPS;i++){
      u=-sd*LIGHTSPAN[i];
      x=Math.round(LIGHTBX[i]+LUX*u);
      y=Math.round(LIGHTBY[i]+LUY*u);
      term.push(x,y);
      night.push(x,y);
    }

    for(i=LIGHTSTEPS;i>=0;i--){
      night.push(LIGHTLIMB[i*2],LIGHTLIMB[i*2+1]);
    }
    return {night:night,term:term};
  }

  function drawEarth(sol){
    var lit=buildLighting(sol.dec);
    g.setColor(CYAN).fillCircle(EARTHX,EARTHY,EARTHR);
    g.setColor(DARKBLUE).fillPoly(lit.night);
    g.setColor(WHITE).drawPoly(lit.term,false);
    g.setColor(WHITE).drawCircle(EARTHX,EARTHY,EARTHR);
  }


  function moonData(){
    var age=(Date.now()-NEWMOON)/86400000;
    age=age%SYNODIC;
    if(age<0)age+=SYNODIC;
    var phase=age/SYNODIC;
    var sunAng=Math.atan2(SUNY-EARTHY,SUNX-EARTHX);

    /* North-side view: new Moon lies toward the Sun; phase increases CCW visually. */
    var a=sunAng-phase*2*Math.PI;
    return {
      age:age,
      phase:phase,
      x:Math.round(EARTHX+MOONORBIT*Math.cos(a)),
      y:Math.round(EARTHY+MOONORBIT*Math.sin(a))
    };
  }

  function drawMoon(){
    var m=moonData();
    var k=(1-Math.cos(m.phase*2*Math.PI))/2;
    var bright=Math.round((2*k-1)*MOONR);

    g.setColor(0x8410).drawCircle(EARTHX,EARTHY,MOONORBIT);

    /* Dark disk first, then a clipped bright portion using a lightweight ellipse-like polygon. */
    g.setColor(0x4208).fillCircle(m.x,m.y,MOONR);

    var p=[],steps=8,i,yy,half,xedge;
    for(i=-steps;i<=steps;i++){
      yy=MOONR*i/steps;
      half=Math.sqrt(Math.max(0,MOONR*MOONR-yy*yy));
      xedge=(m.phase<0.5)?(-half+2*k*half):(half-2*(1-k)*half);
      p.push(Math.round(m.x+xedge),Math.round(m.y+yy));
    }
    for(i=steps;i>=-steps;i--){
      yy=MOONR*i/steps;
      half=Math.sqrt(Math.max(0,MOONR*MOONR-yy*yy));
      p.push(Math.round(m.x+half),Math.round(m.y+yy));
    }
    g.setColor(0xC618).fillPoly(p);
    g.setColor(WHITE).drawCircle(m.x,m.y,MOONR);
    return m;
  }

  function drawObserver(sol){
    var sunAng=Math.atan2(SUNY-EARTHY,SUNX-EARTHX);
    var rr=EARTHR*Math.cos(rad(TESTLAT));
    var a=sunAng-sol.ha;
    var px=EARTHX+rr*Math.cos(a),py=EARTHY+rr*Math.sin(a);
    var rx=px-EARTHX,ry=py-EARTHY;
    var len=Math.sqrt(rx*rx+ry*ry)||1;
    var ux=rx/len,uy=ry/len;
    var hx=-uy,hy=ux;
    var x=Math.round(px),y=Math.round(py);

    g.setColor(0xF81F).drawLine(
      Math.round(px-hx*(EARTHR+8)),Math.round(py-hy*(EARTHR+8)),
      Math.round(px+hx*(EARTHR+8)),Math.round(py+hy*(EARTHR+8))
    );
    g.setColor(0x07E0).drawLine(
      x,y,
      Math.round(px+ux*39),Math.round(py+uy*39)
    );
    g.setColor(RED).fillCircle(x,y,2);
  }

  function drawBase(){
    var t0=getTime();
    g.reset().setBgColor(BLACK).setColor(BLACK).clear();
    var t1=getTime();
    drawSun();
    var t2=getTime();
    var sol=safeSolar();
    var t3=getTime();
    drawEarth(sol);
    var t4=getTime();
    drawObserver(sol);
    var t5=getTime();
    var moon=drawMoon();
    var t6=getTime();
    drawHeader();
    var t7=getTime();

    var c=ms(t0,t1),s=ms(t1,t2),a=ms(t2,t3),e=ms(t3,t4),o=ms(t4,t5),m=ms(t5,t6),h=ms(t6,t7),tot=ms(t0,t7);
    g.setColor(WHITE).setBgColor(BLACK).setFont("4x6",1).setFontAlign(-1,-1);
    g.drawString("0.28  M"+m+" H"+h+" T"+tot+"  Age"+moon.age.toFixed(1),2,26);
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
    clear(transitionTimer);clear(minuteTimer);clear(secondTimer);clear(unlockTimer);
    try{Bangle.removeListener("lock",onLock);}catch(e){}
  }

  buildLightingCache();
  try{Bangle.setUI({mode:"custom",touch:onTouch,btn:function(){if(!busy)Bangle.showLauncher();},remove:cleanup});}catch(e){}
  Bangle.on("lock",onLock);
  try{Bangle.setLocked(false);}catch(e){}
  drawBase();
  armMinute();
  armSecond();
})();
