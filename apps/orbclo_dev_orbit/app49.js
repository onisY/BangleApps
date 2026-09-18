/* Orbclo Dev Orbit 0.49 - Earth stage profiler */
(function(){
  var W=g.getWidth(),H=g.getHeight();
  var Storage=require("Storage"),CFGFILE="orbclo_orbitdev.json";
  var cfg=Storage.readJSON(CFGFILE,1)||{};
  var BLACK=0x0000,WHITE=0xFFFF,NAVY=0x000F,DARKBLUE=0x0008,CYAN=0x07FF,YELLOW=0xFFE0,ORANGE=0xFD20,RED=0xF800,GREEN=0x07E0;
  var busy=false,killed=false,touchCount=0,transitionTimer,minuteTimer,secondTimer,unlockTimer;
  var colonX=0,colonVisible=true,batteryCharging=false;
  var BATLEFT=138;
  var SUNR=(cfg.sunSize===undefined?6:Math.max(4,Math.min(15,cfg.sunSize|0)));
  var EARTHR=(cfg.earthSize===undefined?30:Math.max(25,Math.min(50,cfg.earthSize|0)));
  var MOONR=(cfg.moonSize===undefined?7:Math.max(4,Math.min(15,cfg.moonSize|0)));
  var MOONORBIT=(cfg.moonOrbit===undefined?44:Math.max(40,Math.min(80,cfg.moonOrbit|0)));
  var minOrbit=EARTHR+2*MOONR;
  if(MOONORBIT<minOrbit)MOONORBIT=minOrbit;
  var SUNRAY=4,SUNX=0,SUNY=0,EARTHX=0,EARTHY=0;
  var SYNODIC=29.530588853,NEWMOON=947182440000;
  var MOONLIT=[],MOONFAR=[],MOONFAROUT=[];
  var TESTLAT=(cfg.lat===undefined?35.694:Math.max(-90,Math.min(90,+cfg.lat)));
  var TESTLON=(cfg.lon===undefined?139.754:Math.max(-180,Math.min(180,+cfg.lon)));
  var LIGHTSPAN=[],LIGHTBX=[],LIGHTBY=[],LIGHTLIMB=[],LIGHTSTEPS=6,LUX=0,LUY=0,LVX=0,LVY=0;
  var LIGHTTERM=[],LIGHTNIGHT=[];
  var EP_G=0,EP_F=0,EP_N=0,EP_C=0,EP_R=0;

  /* Lightweight Hemisphere map.  The full Orbit map used many more coastline
     vertices.  At a 25-50 px Earth radius these coarser polygons preserve the
     recognizable continents while keeping redraw cost measurable and modest. */
  var HEMI_LAND=[
    /* North America incl. Alaska and Mexico.  Mexico is intentionally
       exaggerated slightly so the peninsula/waist remains visible at ~30 px radius. */
    [72,-168,65,-154,58,-143,55,-136,49,-127,39,-123,32,-117,
     29,-115,25,-112,22,-108,19,-105,16,-96,18,-90,21,-87,
     22,-91,20,-97,24,-101,27,-98,29,-90,27,-82,32,-80,
     39,-74,49,-64,59,-56,67,-72,74,-96,74,-130],
    /* Greenland */
    [59,-46,67,-57,78,-52,83,-30,75,-18,65,-31],
    /* Eurasia */
    [43,-1,54,2,63,31,71,60,72,100,67,140,59,175,47,145,40,130,32,123,
     24,117,13,106,10,95,20,82,31,63,35,37,41,21,44,11],
    /* North Africa */
    [36,-6,37,10,34,25,27,34,20,25,25,5,31,-8],
    /* Japan main islands, exaggerated slightly for the 176 px display */
    [31,129,33,131,34,134,35,137,38,141,41,142,40,139,37,136,34,133],
    /* Hokkaido */
    [41.5,140,43.5,143,45.5,145,45,142],
    /* Great Britain */
    [50,-5,53,-4,57,-4.5,58,-1,54,-1,50.5,-1]
  ];

  /* Hudson Bay is a sea cutout inside the North America polygon. */
  var HEMI_WATER=[
    [64,-95,62,-88,58,-80,53,-79,51,-85,54,-94,59,-97]
  ];

  var HEMI_XY=[],HEMI_WATER_XY=[],HEMI_SCREEN=[],HEMI_WATER_SCREEN=[],HEMI_ICE_R=0;
  /* Post-night white coastline redraw is the expensive part on Bangle.js 2.
     Keep only the large/diagnostic shapes that materially aid recognition:
     North America, Greenland, Eurasia and Japan. */
  var HEMI_COAST=[0,1,2,4];

  var VIRTUAL_OFFSET=0,DEV_STEP_MS=907200000;

  function clear(t){if(t)clearTimeout(t);}
  function pad(n){return n<10?"0"+n:""+n;}
  function ms(a,b){return Math.round((b-a)*1000);}
  function rad(d){return d*Math.PI/180;}
  function deg(r){return r*180/Math.PI;}
  function virtualNowMs(){return Date.now()+VIRTUAL_OFFSET;}
  function virtualDate(){return new Date(virtualNowMs());}

  function layoutBodies(){
    /* The complete Moon envelope is tangent to the physical left and bottom edges. */
    var env=MOONORBIT+MOONR;
    EARTHX=env;
    EARTHY=H-1-env;

    /* Keep the entire corona visible. Its outer tip, not the solar disk,
       is tangent to the right edge and the celestial area's top edge. */
    var sunOuter=SUNR+SUNRAY;
    SUNX=W-1-sunOuter;
    SUNY=24+sunOuter;
  }

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
    try{return solarPosition(virtualDate(),TESTLAT,TESTLON);}
    catch(e){return {az:0,el:-99,ha:0,dec:0};}
  }

  function riseSetHourAngle(lat,dec){
    /* Geometric sunrise/sunset: solar-center altitude h=0. */
    var la=rad(lat);
    var den=Math.cos(la)*Math.cos(dec);
    if(Math.abs(den)<1e-6){
      var above=Math.sin(la)*Math.sin(dec)>0;
      return {polar:true,day:above,h0:above?Math.PI:0};
    }
    var c=-(Math.sin(la)*Math.sin(dec))/den;
    if(c<=-1)return {polar:true,day:true,h0:Math.PI};
    if(c>=1)return {polar:true,day:false,h0:0};
    return {polar:false,day:false,h0:Math.acos(c)};
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

    LIGHTTERM=new Array((LIGHTSTEPS+1)*2);
    LIGHTNIGHT=new Array((LIGHTSTEPS+1)*4);
  }

  function buildEarthMapCache(){
    /* Precompute latitude/longitude into local polar XY once.  Also allocate
       fixed screen-coordinate arrays here so redraws do not create polygon
       arrays and burden Espruino's allocator/GC. */
    HEMI_XY=[];HEMI_WATER_XY=[];HEMI_SCREEN=[];HEMI_WATER_SCREEN=[];

    function cacheSet(srcSet,dstSet,screenSet){
      for(var k=0;k<srcSet.length;k++){
        var src=srcSet[k],dst=[],scr=new Array(src.length);
        for(var i=0;i<src.length;i+=2){
          var rr=EARTHR*Math.cos(rad(src[i]));
          var da=-rad(src[i+1]-TESTLON); /* north-side view: east is clockwise-negative */
          dst.push(rr*Math.cos(da),rr*Math.sin(da));
        }
        dstSet.push(dst);
        screenSet.push(scr);
      }
    }

    cacheSet(HEMI_LAND,HEMI_XY,HEMI_SCREEN);
    cacheSet(HEMI_WATER,HEMI_WATER_XY,HEMI_WATER_SCREEN);
    HEMI_ICE_R=Math.max(2,Math.round(EARTHR*Math.cos(rad(78))));
  }

  function mapPolyInto(src,p,ca,sa,cx,cy){
    for(var i=0;i<src.length;i+=2){
      var lx=src[i],ly=src[i+1];
      p[i]=(cx+lx*ca-ly*sa+0.5)|0;
      p[i+1]=(cy+lx*sa+ly*ca+0.5)|0;
    }
  }

  function buildLightingInto(dec,cx,cy){
    /* Reuse fixed arrays instead of allocating term/night polygons each redraw. */
    var sd=Math.sin(dec),i,u,x,y,j=0;
    for(i=0;i<=LIGHTSTEPS;i++){
      u=-sd*LIGHTSPAN[i];
      x=Math.round(cx+(LIGHTBX[i]-EARTHX)+LUX*u);
      y=Math.round(cy+(LIGHTBY[i]-EARTHY)+LUY*u);
      LIGHTTERM[i*2]=x;LIGHTTERM[i*2+1]=y;
      LIGHTNIGHT[i*2]=x;LIGHTNIGHT[i*2+1]=y;
    }
    j=(LIGHTSTEPS+1)*2;
    for(i=LIGHTSTEPS;i>=0;i--){
      LIGHTNIGHT[j++]=cx+(LIGHTLIMB[i*2]-EARTHX);
      LIGHTNIGHT[j++]=cy+(LIGHTLIMB[i*2+1]-EARTHY);
    }
  }

  function buildMoonCache(){
    /* Sunlight is parallel to the Earth-Sun line. */
    MOONLIT=[];MOONFAR=[];MOONFAROUT=[];
    var a=Math.atan2(SUNY-EARTHY,SUNX-EARTHX);
    var ro=MOONR+1;
    for(var i=0;i<=8;i++){
      var q=a-Math.PI/2+i*Math.PI/8;
      MOONLIT.push(
        Math.round(Math.cos(q)*MOONR),
        Math.round(Math.sin(q)*MOONR)
      );

      /* Cache both the visible-radius arc and the +1 px erase arc.
         This removes the per-redraw farScale multiplication. */
      var t=-Math.PI/2+i*Math.PI/8;
      var ct=Math.cos(t),st=Math.sin(t);
      MOONFAR.push(ct*MOONR,st*MOONR);
      MOONFAROUT.push(ct*ro,st*ro);
    }
  }

  function drawBoldSpaced(str,x,y,advance,color){
    var xx=x;
    g.setBgColor(WHITE).setColor(color).setFont("12x20").setFontAlign(-1,-1);
    for(var i=0;i<str.length;i++){
      if(str[i]===" "){xx+=7;continue;}
      g.drawString(str[i],xx,y);
      g.drawString(str[i],xx+1,y);
      xx+=advance;
    }
    return xx;
  }

  function isCharging(){
    try{return !!Bangle.isCharging();}catch(e){return false;}
  }

  function drawBattery(show){
    var bat=E.getBattery(),txt=""+bat;
    g.setColor(WHITE).fillRect(BATLEFT,0,W-1,23);
    if(!show)return;
    g.setBgColor(WHITE)
      .setColor(bat<=20?RED:GREEN)
      .setFont("12x20")
      .setFontAlign(1,-1);
    g.drawString(txt,W-1,2);
    g.drawString(txt,W-2,2);
  }

  function drawHeader(){
    var d=virtualDate();
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
    drawBoldSpaced(post,x,2,adv,BLACK);

    batteryCharging=isCharging();
    drawBattery(!batteryCharging||colonVisible);
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

    var charging=isCharging();
    if(charging)drawBattery(show);
    else if(batteryCharging)drawBattery(true);
    batteryCharging=charging;
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
    var r=SUNR;
    /* Reference axis is intentionally behind both bodies. */
    g.setColor(0x8410).drawLine(EARTHX,EARTHY,SUNX,SUNY);
    g.setColor(ORANGE);
    for(var i=0;i<8;i++){
      var a=i*Math.PI/4;
      g.drawLine(Math.round(SUNX+Math.cos(a)*(r+1)),Math.round(SUNY+Math.sin(a)*(r+1)),Math.round(SUNX+Math.cos(a)*(r+SUNRAY)),Math.round(SUNY+Math.sin(a)*(r+SUNRAY)));
    }
    g.setColor(YELLOW).fillCircle(SUNX,SUNY,r);
  }

  function drawEarth(sol){
    /* V0.49 changes no intended Earth appearance; it only profiles the
       individual Earth stages so the next optimization can target real cost. */
    var p0=getTime(),p1,p2,p3,p4,p5;

    buildLightingInto(sol.dec,EARTHX,EARTHY);
    var sunAng=Math.atan2(SUNY-EARTHY,SUNX-EARTHX);
    var baseA=sunAng-sol.ha;
    var ca=Math.cos(baseA),sa=Math.sin(baseA);
    var i;

    /* Geometry stage: rotate every cached land/water point first. */
    for(i=0;i<HEMI_XY.length;i++)
      mapPolyInto(HEMI_XY[i],HEMI_SCREEN[i],ca,sa,EARTHX,EARTHY);
    for(i=0;i<HEMI_WATER_XY.length;i++)
      mapPolyInto(HEMI_WATER_XY[i],HEMI_WATER_SCREEN[i],ca,sa,EARTHX,EARTHY);
    p1=getTime();

    /* F = base sea + land fills + Hudson Bay cutout. */
    g.setColor(CYAN).fillCircle(EARTHX,EARTHY,EARTHR);
    g.setColor(GREEN);
    for(i=0;i<HEMI_SCREEN.length;i++)g.fillPoly(HEMI_SCREEN[i]);
    g.setColor(CYAN);
    for(i=0;i<HEMI_WATER_SCREEN.length;i++)g.fillPoly(HEMI_WATER_SCREEN[i]);
    p2=getTime();

    /* N = seasonal night overlay. */
    g.setColor(DARKBLUE).fillPoly(LIGHTNIGHT);
    p3=getTime();

    /* C = selected post-night coastline redraw. */
    g.setColor(WHITE);
    for(i=0;i<HEMI_COAST.length;i++)
      g.drawPoly(HEMI_SCREEN[HEMI_COAST[i]],true);
    g.drawPoly(HEMI_WATER_SCREEN[0],true);
    p4=getTime();

    /* R = remaining Earth detail: ice, terminator and outer rim. */
    g.fillCircle(EARTHX,EARTHY,HEMI_ICE_R);
    g.drawPoly(LIGHTTERM,false);
    g.drawCircle(EARTHX,EARTHY,EARTHR);
    p5=getTime();

    EP_G=ms(p0,p1);
    EP_F=ms(p1,p2);
    EP_N=ms(p2,p3);
    EP_C=ms(p3,p4);
    EP_R=ms(p4,p5);
  }

  function moonData(){
    var age=(virtualNowMs()-NEWMOON)/86400000;
    age=age%SYNODIC;
    if(age<0)age+=SYNODIC;
    var phase=age/SYNODIC;
    var sunAng=Math.atan2(SUNY-EARTHY,SUNX-EARTHX);

    /* North-side view: new Moon lies toward the Sun; phase increases CCW visually. */
    var a=sunAng-phase*2*Math.PI;
    var ca=Math.cos(a),sa=Math.sin(a);
    return {
      age:age,
      phase:phase,
      x:Math.round(EARTHX+MOONORBIT*ca),
      y:Math.round(EARTHY+MOONORBIT*sa),
      ux:ca,uy:sa,vx:-sa,vy:ca
    };
  }

  function drawMoon(){
    var m=moonData();

    g.setColor(0x8410).drawCircle(EARTHX,EARTHY,MOONORBIT);

    /* Solar illumination: anti-sun hemisphere navy, sunward hemisphere yellow. */
    g.setColor(NAVY).fillCircle(m.x,m.y,MOONR);

    var p=[],i;
    for(i=0;i<MOONLIT.length;i+=2){
      p.push(m.x+MOONLIT[i],m.y+MOONLIT[i+1]);
    }
    g.setColor(YELLOW).fillPoly(p);

    /* Reuse the orbit direction already calculated in moonData().
       V0.40 recomputed it with sqrt/division here; on Bangle.js that was costly. */
    var ux=m.ux,uy=m.uy,vx=m.vx,vy=m.vy;
    var far=[],near=[],j=0,fx,fy,nx,ny;
    for(i=0;i<MOONFAR.length;i+=2,j+=2){
      fx=MOONFAROUT[i];fy=MOONFAROUT[i+1];
      nx=MOONFAR[i];ny=MOONFAR[i+1];

      /* Screen coordinates are non-negative, so +0.5 then integer coercion
         is equivalent to Math.round() but cheaper on the watch. */
      far[j]=(m.x+ux*fx+vx*fy+0.5)|0;
      far[j+1]=(m.y+uy*fx+vy*fy+0.5)|0;
      near[j]=(m.x-ux*nx+vx*ny+0.5)|0;
      near[j+1]=(m.y-uy*nx+vy*ny+0.5)|0;
    }
    g.setColor(BLACK).fillPoly(far);
    g.setColor(WHITE).drawPoly(near,false);
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
    var x=Math.round(px),y=Math.round(py);
    var rs=riseSetHourAngle(TESTLAT,sol.dec);

    /* Sunrise and sunset rays: +/-H0 from the local outward radial direction.
       At equinox H0 is about 90 degrees, so they appear as the old straight
       magenta tangent. In polar day/night there is no rise/set crossing. */
    if(!rs.polar){
      var plen=EARTHR+8;
      var ar=a-rs.h0,as=a+rs.h0;
      g.setColor(0xF81F);
      g.drawLine(x,y,
        Math.round(px+Math.cos(ar)*plen),
        Math.round(py+Math.sin(ar)*plen));
      g.drawLine(x,y,
        Math.round(px+Math.cos(as)*plen),
        Math.round(py+Math.sin(as)*plen));
    }

    /* Zenith length is unchanged from V0.42. */
    var zenEndR=MOONORBIT+MOONR/2;
    var zen=Math.max(0,Math.round(zenEndR-rr));
    var zx=Math.round(px+ux*zen),zy=Math.round(py+uy*zen);

    /* Match the red observer marker's 5 px diameter (fillCircle radius 2).
       A single filled quadrilateral is cheaper than five parallel drawLine calls. */
    var hw=2;
    var qx=-uy*hw,qy=ux*hw;
    g.setColor(0x07E0).fillPoly([
      Math.round(x+qx),Math.round(y+qy),
      Math.round(zx+qx),Math.round(zy+qy),
      Math.round(zx-qx),Math.round(zy-qy),
      Math.round(x-qx),Math.round(y-qy)
    ]);

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
    g.setColor(WHITE).setBgColor(BLACK).setFont("6x8",1).setFontAlign(-1,-1);
    g.drawString("E"+e+" M"+m+" H"+h+" T"+tot,2,26);
    g.setFont("4x6",1);
    g.drawString("G"+EP_G+" F"+EP_F+" N"+EP_N+" C"+EP_C+" R"+EP_R,2,36);
    g.drawString("V049 R"+EARTHR+" M"+MOONR+" O"+MOONORBIT+" S"+SUNR,2,44);
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
    VIRTUAL_OFFSET+=DEV_STEP_MS;
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

  layoutBodies();
  buildLightingCache();
  buildEarthMapCache();
  buildMoonCache();
  try{Bangle.setUI({mode:"custom",touch:onTouch,btn:function(){if(!busy)Bangle.showLauncher();},remove:cleanup});}catch(e){}
  Bangle.on("lock",onLock);
  try{Bangle.setLocked(false);}catch(e){}
  drawBase();
  armMinute();
  armSecond();
})();
