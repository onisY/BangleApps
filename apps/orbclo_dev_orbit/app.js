/* Orbclo Dev Orbit 0.24 - seasonal curved terminator */
(function(){
  var W=g.getWidth(),H=g.getHeight();
  var BLACK=0x0000,WHITE=0xFFFF,NAVY=0x000F,DARKBLUE=0x0008,CYAN=0x07FF,YELLOW=0xFFE0,ORANGE=0xFD20,RED=0xF800;
  var busy=false,killed=false,touchCount=0,transitionTimer,minuteTimer,secondTimer,unlockTimer;
  var colonX=0,colonVisible=true;
  var SUNX=W-28,SUNY=52,EARTHX=54,EARTHY=116,EARTHR=30;
  var TESTLAT=35.694,TESTLON=139.754;

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
    var a=Math.atan2(SUNY-EARTHY,SUNX-EARTHX);
    var ux=Math.cos(a),uy=Math.sin(a);
    var vx=-uy,vy=ux;
    var sd=Math.sin(dec);
    var term=[],night=[];
    var steps=12,i,v,span,u,x,y;

    /* Orthographic north-pole view of the spherical solar terminator.
       u is along the projected Earth->Sun direction, v is perpendicular. */
    for(i=0;i<=steps;i++){
      v=-EARTHR+2*EARTHR*i/steps;
      span=Math.sqrt(Math.max(0,EARTHR*EARTHR-v*v));
      u=-sd*span;
      x=Math.round(EARTHX+ux*u+vx*v);
      y=Math.round(EARTHY+uy*u+vy*v);
      term.push(x,y);
      night.push(x,y);
    }

    /* Return along the anti-solar limb. This closes only the night region. */
    for(i=steps;i>=0;i--){
      v=-EARTHR+2*EARTHR*i/steps;
      span=Math.sqrt(Math.max(0,EARTHR*EARTHR-v*v));
      u=-span;
      night.push(
        Math.round(EARTHX+ux*u+vx*v),
        Math.round(EARTHY+uy*u+vy*v)
      );
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
    drawHeader();
    var t6=getTime();

    var c=ms(t0,t1),s=ms(t1,t2),a=ms(t2,t3),e=ms(t3,t4),o=ms(t4,t5),h=ms(t5,t6),tot=ms(t0,t6);
    g.setColor(WHITE).setBgColor(BLACK).setFont("6x8",1).setFontAlign(0,0);
    g.drawString("OBS 0.24 D"+Math.round(deg(sol.dec))+" Az"+Math.round(sol.az)+" El"+Math.round(sol.el),W>>1,H-22);
    g.drawString("C"+c+" S"+s+" A"+a+" E"+e+" O"+o+" H"+h+" T"+tot,W>>1,H-10);
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

  try{Bangle.setUI({mode:"custom",touch:onTouch,btn:function(){if(!busy)Bangle.showLauncher();},remove:cleanup});}catch(e){}
  Bangle.on("lock",onLock);
  try{Bangle.setLocked(false);}catch(e){}
  drawBase();
  armMinute();
  armSecond();
})();
