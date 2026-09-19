/* Orbclo Dev Orbit 0.57 - real-time integrated controls */
(function(){
  var W=g.getWidth(),H=g.getHeight();
  var Storage=require("Storage"),CFGFILE="orbclo_orbitdev.json";
  var cfg=Storage.readJSON(CFGFILE,1)||{};
  var calModule,calendar;
  try{
    var calSource=Storage.read("orbclo_dev_orbit.cal.js");
    if(calSource){calModule=eval(calSource);calendar=calModule.create();}
    calSource=undefined;
  }catch(calErr){calModule=undefined;calendar=undefined;}
  var BLACK=0x0000,WHITE=0xFFFF,NAVY=0x000F,DARKBLUE=0x0008,CYAN=0x07FF,YELLOW=0xFFE0,ORANGE=0xFD20,RED=0xF800,GREEN=0x07E0;
  var busy=false,killed=false,minuteTimer,secondTimer,idleTimer,tapTimer;
  var mode="orbit",interactive=false,tapCount=0,resetOnWake=false,buttonWatch;
  var selectedDayOffset=0,hasSelectedDate=false;
  var colonX=0,colonVisible=true,batteryCharging=false;
  var BATLEFT=138;
  var SUNR=(cfg.sunSize===undefined?6:Math.max(4,Math.min(15,cfg.sunSize|0)));
  var EARTHR=(cfg.earthSize===undefined?30:Math.max(25,Math.min(50,cfg.earthSize|0)));
  var MOONR=(cfg.moonSize===undefined?7:Math.max(4,Math.min(15,cfg.moonSize|0)));
  var MOONORBIT=(cfg.moonOrbit===undefined?44:Math.max(40,Math.min(80,cfg.moonOrbit|0)));
  /* Keep at least one full lunar diameter between the Earth and Moon surfaces.
     Center-to-center minimum = Earth radius + Moon diameter + Moon radius. */
  var minOrbit=EARTHR+3*MOONR;
  if(MOONORBIT<minOrbit)MOONORBIT=minOrbit;
  var SUNRAY=4,SUNX=0,SUNY=0,EARTHX=0,EARTHY=0;
  var SUN_RAYS=[],SUN_TEX_ORANGE=[],SUN_SPOT_X=0,SUN_SPOT_Y=0;
  var SYNODIC=29.530588853,NEWMOON=947182440000;
  var MOONLIT=[],MOONFAR=[],MOONFAROUT=[];
  var MOON_LIT_MAT=[1,0,0,1,0,0],MOON_FAR_MAT=[1,0,0,1,0,0],MOON_NEAR_MAT=[1,0,0,1,0,0];
  var MOON_NATIVE=(typeof g.transformVertices==="function"),SUNANG=0;
  var MOON_CACHE_MS=1800000,MOON_CACHE_BUCKET=-1,MOON_CACHE_DATA;
  var MOON_CACHE_LIT,MOON_CACHE_FAR,MOON_CACHE_NEAR;
  var TESTLAT=(cfg.lat===undefined?35.694:Math.max(-90,Math.min(90,+cfg.lat)));
  var TESTLON=(cfg.lon===undefined?139.754:Math.max(-180,Math.min(180,+cfg.lon)));
  var LIGHTSPAN=[],LIGHTBX=[],LIGHTBY=[],LIGHTLIMB=[],LIGHTSTEPS=6,LUX=0,LUY=0,LVX=0,LVY=0;
  var LIGHTTERM=[],LIGHTNIGHT=[];

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
  var HEMI_MAT=[1,0,0,1,0,0];
  var HEMI_NATIVE=(typeof g.transformVertices==="function");

  function clear(t){if(t)clearTimeout(t);}
  function pad(n){return n<10?"0"+n:""+n;}
  function rad(d){return d*Math.PI/180;}
  function deg(r){return r*180/Math.PI;}
  function virtualNowMs(){return Date.now()+selectedDayOffset*86400000;}
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

  function buildSunCache(){
    /* Sun geometry is static on this clock face, so cache ray endpoints and
       a tiny deterministic photosphere pattern once instead of recalculating
       trig or texture positions on every redraw. */
    SUN_RAYS=[];SUN_TEX_ORANGE=[];
    var i,a,ri=SUNR+1,ro=SUNR+SUNRAY;
    for(i=0;i<8;i++){
      a=i*Math.PI/4;
      SUN_RAYS.push(
        Math.round(SUNX+Math.cos(a)*ri),
        Math.round(SUNY+Math.sin(a)*ri),
        Math.round(SUNX+Math.cos(a)*ro),
        Math.round(SUNY+Math.sin(a)*ro)
      );
    }

    /* Stylized granulation offsets, scaled from the default 6 px radius.
       Keep them sparse so the small Sun remains legible on Bangle.js 2. */
    var p=[
      -0.50,-0.17, -0.17,-0.50, 0.33,-0.33, 0.50,0.00,
       0.17,0.50, -0.33,0.33, -0.17,0.00, 0.33,0.17
    ];
    for(i=0;i<p.length;i+=2)
      SUN_TEX_ORANGE.push(Math.round(p[i]*SUNR),Math.round(p[i+1]*SUNR));

    /* Cache one compact active-region center.  At the default 6 px radius
       a radius-1 red patch is large enough to be visibly red on Bangle.js 2,
       with a single black core pixel to retain the sunspot cue. */
    SUN_SPOT_X=Math.round(-0.25*SUNR);
    SUN_SPOT_Y=Math.round(0.17*SUNR);
  }

  function buildLightingCache(){
    LIGHTSPAN=[];LIGHTBX=[];LIGHTBY=[];LIGHTLIMB=[];
    var a=Math.atan2(SUNY-EARTHY,SUNX-EARTHX);
    SUNANG=a;
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
    var a=SUNANG;
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
    if(killed||busy||mode!=="orbit")return;
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
      if(!killed&&mode==="orbit"){
        var show=(new Date().getSeconds()%2)===0;
        if(show!==colonVisible)drawColon(show);
        armSecond();
      }
    },1000-(Date.now()%1000)+20);
  }

  function drawSun(){
    var i;
    /* Reference axis is intentionally behind both bodies. */
    g.setColor(0x8410).drawLine(EARTHX,EARTHY,SUNX,SUNY);

    /* Cached corona rays: no redraw-time trigonometry. */
    g.setColor(ORANGE);
    for(i=0;i<SUN_RAYS.length;i+=4)
      g.drawLine(SUN_RAYS[i],SUN_RAYS[i+1],SUN_RAYS[i+2],SUN_RAYS[i+3]);

    /* Photosphere: yellow disk, orange limb/granulation, small dark sunspot. */
    g.setColor(YELLOW).fillCircle(SUNX,SUNY,SUNR);
    g.setColor(ORANGE).drawCircle(SUNX,SUNY,SUNR);
    for(i=0;i<SUN_TEX_ORANGE.length;i+=2)
      g.setPixel(SUNX+SUN_TEX_ORANGE[i],SUNY+SUN_TEX_ORANGE[i+1]);

    /* Solar active region: visible red surround with a black spot core. */
    var sx=SUNX+SUN_SPOT_X,sy=SUNY+SUN_SPOT_Y;
    g.setColor(RED).fillCircle(sx,sy,1);
    g.setColor(BLACK).setPixel(sx,sy);
  }

  function drawEarth(sol){
    /* Keep V0.50's native vertex transform, but remove all internal profiling.
       drawBase() still measures total Earth time E for real-use comparison. */
    buildLightingInto(sol.dec,EARTHX,EARTHY);

    var sunAng=Math.atan2(SUNY-EARTHY,SUNX-EARTHX);
    var baseA=sunAng-sol.ha;
    var ca=Math.cos(baseA),sa=Math.sin(baseA);
    var i;

    HEMI_MAT[0]=ca; HEMI_MAT[1]=sa;
    HEMI_MAT[2]=-sa; HEMI_MAT[3]=ca;
    HEMI_MAT[4]=EARTHX; HEMI_MAT[5]=EARTHY;

    if(HEMI_NATIVE){
      try{
        for(i=0;i<HEMI_XY.length;i++)
          HEMI_SCREEN[i]=g.transformVertices(HEMI_XY[i],HEMI_MAT);
        for(i=0;i<HEMI_WATER_XY.length;i++)
          HEMI_WATER_SCREEN[i]=g.transformVertices(HEMI_WATER_XY[i],HEMI_MAT);
      }catch(ex){
        HEMI_NATIVE=false;
      }
    }
    if(!HEMI_NATIVE){
      for(i=0;i<HEMI_XY.length;i++)
        mapPolyInto(HEMI_XY[i],HEMI_SCREEN[i],ca,sa,EARTHX,EARTHY);
      for(i=0;i<HEMI_WATER_XY.length;i++)
        mapPolyInto(HEMI_WATER_XY[i],HEMI_WATER_SCREEN[i],ca,sa,EARTHX,EARTHY);
    }

    g.setColor(CYAN).fillCircle(EARTHX,EARTHY,EARTHR);
    g.setColor(GREEN);
    for(i=0;i<HEMI_SCREEN.length;i++)g.fillPoly(HEMI_SCREEN[i]);

    g.setColor(CYAN);
    for(i=0;i<HEMI_WATER_SCREEN.length;i++)g.fillPoly(HEMI_WATER_SCREEN[i]);

    g.setColor(DARKBLUE).fillPoly(LIGHTNIGHT);

    g.setColor(WHITE);
    for(i=0;i<HEMI_COAST.length;i++)
      g.drawPoly(HEMI_SCREEN[HEMI_COAST[i]],true);
    g.drawPoly(HEMI_WATER_SCREEN[0],true);

    g.fillCircle(EARTHX,EARTHY,HEMI_ICE_R);
    g.drawPoly(LIGHTTERM,false);
    g.drawCircle(EARTHX,EARTHY,EARTHR);
  }

  function moonData(nowMs){
    if(nowMs===undefined)nowMs=virtualNowMs();
    var age=(nowMs-NEWMOON)/86400000;
    age=age%SYNODIC;
    if(age<0)age+=SYNODIC;
    var phase=age/SYNODIC;

    /* North-side view: new Moon lies toward the Sun; phase increases CCW visually. */
    var a=SUNANG-phase*2*Math.PI;
    var ca=Math.cos(a),sa=Math.sin(a);
    return {
      age:age,
      phase:phase,
      x:Math.round(EARTHX+MOONORBIT*ca),
      y:Math.round(EARTHY+MOONORBIT*sa),
      ux:ca,uy:sa,vx:-sa,vy:ca
    };
  }

  function rebuildMoonGeometry(nowMs){
    var m=moonData(nowMs);
    var lit,far,near,i,j,fx,fy,nx,ny;
    var ux=m.ux,uy=m.uy,vx=m.vx,vy=m.vy;

    if(MOON_NATIVE){
      try{
        MOON_LIT_MAT[4]=m.x; MOON_LIT_MAT[5]=m.y;

        MOON_FAR_MAT[0]=ux; MOON_FAR_MAT[1]=uy;
        MOON_FAR_MAT[2]=vx; MOON_FAR_MAT[3]=vy;
        MOON_FAR_MAT[4]=m.x; MOON_FAR_MAT[5]=m.y;

        MOON_NEAR_MAT[0]=-ux; MOON_NEAR_MAT[1]=-uy;
        MOON_NEAR_MAT[2]=vx; MOON_NEAR_MAT[3]=vy;
        MOON_NEAR_MAT[4]=m.x; MOON_NEAR_MAT[5]=m.y;

        lit=g.transformVertices(MOONLIT,MOON_LIT_MAT);
        far=g.transformVertices(MOONFAROUT,MOON_FAR_MAT);
        near=g.transformVertices(MOONFAR,MOON_NEAR_MAT);
      }catch(ex){
        MOON_NATIVE=false;
      }
    }

    if(!MOON_NATIVE){
      lit=[];
      for(i=0;i<MOONLIT.length;i+=2)
        lit.push(m.x+MOONLIT[i],m.y+MOONLIT[i+1]);

      far=[];near=[];j=0;
      for(i=0;i<MOONFAR.length;i+=2,j+=2){
        fx=MOONFAROUT[i];fy=MOONFAROUT[i+1];
        nx=MOONFAR[i];ny=MOONFAR[i+1];
        far[j]=(m.x+ux*fx+vx*fy+0.5)|0;
        far[j+1]=(m.y+uy*fx+vy*fy+0.5)|0;
        near[j]=(m.x-ux*nx+vx*ny+0.5)|0;
        near[j+1]=(m.y-uy*nx+vy*ny+0.5)|0;
      }
    }

    MOON_CACHE_DATA=m;
    MOON_CACHE_LIT=lit;
    MOON_CACHE_FAR=far;
    MOON_CACHE_NEAR=near;
  }

  function drawMoon(){
    var nowMs=virtualNowMs();
    var bucket=Math.floor(nowMs/MOON_CACHE_MS);

    /* The Moon moves only a fraction of a pixel during this cache interval,
       so normal clock redraws can reuse the already-rasterized geometry. */
    if(bucket!==MOON_CACHE_BUCKET || MOON_CACHE_DATA===undefined){
      rebuildMoonGeometry(nowMs);
      MOON_CACHE_BUCKET=bucket;
    }

    var m=MOON_CACHE_DATA;
    g.setColor(0x8410).drawCircle(EARTHX,EARTHY,MOONORBIT);
    g.setColor(NAVY).fillCircle(m.x,m.y,MOONR);
    g.setColor(YELLOW).fillPoly(MOON_CACHE_LIT);
    g.setColor(BLACK).fillPoly(MOON_CACHE_FAR);
    g.setColor(WHITE).drawPoly(MOON_CACHE_NEAR,false);
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
    /* Clean real-use redraw: no per-stage timers or on-screen diagnostics. */
    g.reset().setBgColor(BLACK).setColor(BLACK).clear();
    drawSun();
    var sol=safeSolar();
    drawEarth(sol);
    drawObserver(sol);
    drawMoon();
    drawHeader();
    try{g.flip();}catch(err){}
    busy=false;
  }

  function clearTaps(){
    clear(tapTimer);tapTimer=undefined;tapCount=0;
  }

  function showTransition(){
    if(!Bangle.isLCDOn())return;
    try{
      g.reset().setBgColor(NAVY).setColor(NAVY).clear();
      g.flip();
    }catch(e){}
  }

  function dayNumber(d){
    return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000);
  }

  function stopOrbitTimers(){
    clear(minuteTimer);minuteTimer=undefined;
    clear(secondTimer);secondTimer=undefined;
    clear(idleTimer);idleTimer=undefined;
    clearTaps();
  }

  function armIdle(){
    clear(idleTimer);
    if(mode!=="orbit"||!interactive)return;
    idleTimer=setTimeout(goIdle,8000);
  }

  function startInteraction(){
    if(killed||mode!=="orbit")return;
    interactive=true;
    try{Bangle.setLocked(false);}catch(e){}
    try{Bangle.setBacklight(true);}catch(e){}
    armIdle();
  }

  function goIdle(){
    clear(idleTimer);idleTimer=undefined;
    clearTaps();
    interactive=false;
    try{Bangle.setBacklight(false);}catch(e){}
    try{Bangle.setLocked(true);}catch(e){}
  }

  function startOrbit(keepInteractive){
    if(killed)return;
    if(calendar)calendar.stop();
    mode="orbit";
    busy=false;
    try{Bangle.setUI({mode:"custom"});}catch(e){}
    drawBase();
    armMinute();
    armSecond();
    interactive=!!keepInteractive;
    if(interactive){
      try{Bangle.setLocked(false);}catch(e){}
      try{Bangle.setBacklight(true);}catch(e){}
      armIdle();
    }else{
      try{Bangle.setLocked(true);}catch(e){}
    }
  }

  function setDateFromCalendar(d){
    if(d){
      hasSelectedDate=true;
      selectedDayOffset=dayNumber(d)-dayNumber(new Date());
    }else{
      hasSelectedDate=false;
      selectedDayOffset=0;
    }
    MOON_CACHE_BUCKET=-1;
  }

  function openCalendar(){
    if(killed||mode!=="orbit")return;
    showTransition();
    stopOrbitTimers();
    mode="calendar";
    interactive=false;
    try{Bangle.setLocked(false);}catch(e){}
    try{Bangle.setBacklight(true);}catch(e){}

    if(calendar){
      var focus=hasSelectedDate?virtualDate():new Date();
      calendar.start({
        focusDate:focus,
        selectedDate:hasSelectedDate?focus:undefined,
        onReturn:function(d){
          if(killed)return;
          showTransition();
          setDateFromCalendar(d);
          startOrbit(true);
        }
      });
      return;
    }

    var info=Storage.readJSON("fivewcal.info",1);
    var src=(info&&info.src&&Storage.read(info.src)!==undefined)?info.src:
      (Storage.read("fivewcal.app.js")!==undefined?"fivewcal.app.js":undefined);
    if(src){load(src);return;}
    Bangle.showLauncher();
  }

  function saveCfg(){Storage.writeJSON(CFGFILE,cfg);}

  function openSettings(){
    if(killed||mode!=="orbit")return;
    showTransition();
    stopOrbitTimers();
    mode="settings";
    interactive=false;
    try{Bangle.setLocked(false);}catch(e){}
    try{Bangle.setBacklight(true);}catch(e){}

    var cc=calModule?calModule.readConfig():{lang:"ja",ukRegion:"ew",timeout:30};
    function saveCal(){if(calModule)calModule.writeConfig(cc);}
    E.showMenu({
      "":{title:"Orbit / 5wCal"},
      "< Back":function(){load("orbclo_dev_orbit.app.js");},
      "Latitude":{
        value:TESTLAT,min:-90,max:90,step:0.001,
        format:function(v){return v.toFixed(3);},
        onchange:function(v){cfg.lat=v;saveCfg();}
      },
      "Longitude":{
        value:TESTLON,min:-180,max:180,step:0.001,
        format:function(v){return v.toFixed(3);},
        onchange:function(v){cfg.lon=v;saveCfg();}
      },
      "Sun size":{
        value:SUNR,min:4,max:15,step:1,
        onchange:function(v){cfg.sunSize=v;saveCfg();}
      },
      "Earth size":{
        value:EARTHR,min:25,max:50,step:1,
        onchange:function(v){cfg.earthSize=v;saveCfg();}
      },
      "Moon size":{
        value:MOONR,min:4,max:15,step:1,
        onchange:function(v){cfg.moonSize=v;saveCfg();}
      },
      "Moon orbit":{
        value:MOONORBIT,min:40,max:80,step:1,
        onchange:function(v){cfg.moonOrbit=v;saveCfg();}
      },
      "Cal language":{
        value:cc.lang==="en"?1:0,min:0,max:1,step:1,
        format:function(v){return v?"English":"Japanese";},
        onchange:function(v){cc.lang=v?"en":"ja";saveCal();}
      },
      "Cal holidays":{
        value:cc.ukRegion==="sc"?1:0,min:0,max:1,step:1,
        format:function(v){return v?"Scotland":"England/Wales";},
        onchange:function(v){cc.ukRegion=v?"sc":"ew";saveCal();}
      },
      "Cal auto return":{
        value:cc.timeout,min:15,max:120,step:15,
        format:function(v){return v+" s";},
        onchange:function(v){cc.timeout=v;saveCal();}
      }
    });
  }

  function onTouch(button,xy){
    if(killed)return;
    if(mode==="calendar"){
      if(calendar)calendar.touch(xy);
      return;
    }
    if(mode!=="orbit"||busy||!interactive)return;
    try{if(Bangle.isLocked())return;}catch(e){}

    if(tapTimer){
      clear(tapTimer);tapTimer=undefined;tapCount=0;
      openSettings();
      return;
    }

    tapCount=1;
    tapTimer=setTimeout(function(){
      tapTimer=undefined;tapCount=0;
      if(!killed&&mode==="orbit")openCalendar();
    },400);
  }

  function onSwipe(lr,ud){
    if(killed)return;
    if(mode==="calendar"&&calendar)calendar.swipe(lr,ud);
  }

  function onFaceUp(up){
    if(up&&mode==="orbit")startInteraction();
  }

  function onLCD(on){
    if(!on){
      clearTaps();
      clear(idleTimer);idleTimer=undefined;
      interactive=false;
      try{Bangle.setLocked(true);}catch(e){}

      if(mode==="calendar"&&calendar)calendar.stop();
      if(mode!=="orbit"||selectedDayOffset!==0){
        selectedDayOffset=0;
        hasSelectedDate=false;
        MOON_CACHE_BUCKET=-1;
        resetOnWake=true;
      }
      return;
    }

    if(resetOnWake){
      resetOnWake=false;
      startOrbit(false);
    }
  }

  function onButton(){
    if(killed)return;
    cleanup();
    Bangle.showLauncher();
  }

  function installButtonWatch(){
    if(buttonWatch)clearWatch(buttonWatch);
    buttonWatch=setWatch(onButton,BTN1,{repeat:true,edge:"rising",debounce:30});
  }

  function armMinute(){
    clear(minuteTimer);
    minuteTimer=setTimeout(function(){
      minuteTimer=undefined;
      if(!killed&&mode==="orbit"){drawBase();armMinute();}
    },60000-(Date.now()%60000)+25);
  }

  function cleanup(){
    if(killed)return;
    killed=true;
    stopOrbitTimers();
    if(calendar)calendar.stop();
    if(buttonWatch){clearWatch(buttonWatch);buttonWatch=undefined;}
    try{Bangle.removeListener("touch",onTouch);}catch(e){}
    try{Bangle.removeListener("swipe",onSwipe);}catch(e){}
    try{Bangle.removeListener("faceUp",onFaceUp);}catch(e){}
    try{Bangle.removeListener("lcdPower",onLCD);}catch(e){}
    try{E.removeListener("kill",cleanup);}catch(e){}
  }

  layoutBodies();
  buildSunCache();
  buildLightingCache();
  buildEarthMapCache();
  buildMoonCache();
  try{Bangle.setUI({mode:"custom"});}catch(e){}
  Bangle.on("touch",onTouch);
  Bangle.on("swipe",onSwipe);
  Bangle.on("faceUp",onFaceUp);
  Bangle.on("lcdPower",onLCD);
  E.on("kill",cleanup);
  installButtonWatch();
  try{Bangle.setBacklight(false);}catch(e){}
  try{Bangle.setLocked(true);}catch(e){}
  drawBase();
  armMinute();
  armSecond();
})();
