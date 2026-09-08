try {
(function () {
  var Storage = require("Storage");
  var FILE = "orbit.json";
  var W = g.getWidth(), H = g.getHeight();
  var PI = Math.PI, TAU = PI*2, RAD = PI/180;
  var DAY = 86400000, J1970 = 2440588, J2000 = 2451545;
  var SYNODIC = 29.530588853;
  function utc(y,m0,d,h,mi,s){
    var m=m0+1;
    if(m<=2)y--;
    var era=Math.floor(y/400);
    var yoe=y-era*400;
    var mp=m+(m>2?-3:9);
    var doy=Math.floor((153*mp+2)/5)+d-1;
    var doe=yoe*365+Math.floor(yoe/4)-Math.floor(yoe/100)+doy;
    var days=era*146097+doe-719468;
    return days*DAY+h*3600000+mi*60000+s*1000;
  }
  var PHASE_ANCHOR = utc(2000,0,6,18,14,0);

  var SX = 145, SY = 50;
  var EX = 74, EY = 101;

  var def = {
    locationMode:0,
    locPref:"Tokyo",locName:"Chiyoda-ku",lat:35.694,lon:139.754,elevationM:16,
    sunSize:6,earthSize:30,moonSize:9,markerSize:2
  };
  var settings = Storage.readJSON(FILE,1) || {};
  Object.keys(def).forEach(function(k){ if (settings[k]===undefined) settings[k]=def[k]; });
  // Migrate old Tokyo default to the new Chiyoda-ku entry.
  if(settings.locPref==="Tokyo" && settings.locName==="Tokyo"){
    settings.locName="Chiyoda-ku";
    settings.lat=35.694;
    settings.lon=139.754;
    settings.elevationM=16;
    Storage.writeJSON(FILE,settings);
  }
  if(settings.locationMode!==1 && settings.locPref==="Tokyo" &&
     settings.locName==="Chiyoda-ku" && (!isFinite(settings.elevationM) || settings.elevationM===0)){
    settings.elevationM=16;
    Storage.writeJSON(FILE,settings);
  }
  var loc = {name:settings.locName,lat:settings.lat,lon:settings.lon,
    elevationM:settings.elevationM||0,pref:settings.locPref};

  var C = {bg:"#000",fg:"#fff",sun:"#f22",flare:"#f80",earth:"#5cf",earthEdge:"#9ef",
           marker:"#f00",horizon:"#f0f",moon:"#fd4",orbit:"#555",rise:"#ff0",set:"#f80",
           noon:"#ccc",penumbra:"#631",slider:"#777",nowBg:"#0f0",shiftBg:"#f00",zenith:"#0f0"};
  var dragActive = false, tickTimer, timeOffsetMs = 0, lastCenterTap = 0;
  var holdTimer, holdDir = 0, edgeDownDir = 0, edgeDownAt = 0;
  var edgeTapTimer, pendingEdgeDir = 0;
  var interactive = false, idleTimer;
  var batteryPct=E.getBattery(), batterySampleAt=Date.now();

  function refreshBattery(){
    var now=Date.now();
    if(now-batterySampleAt>=600000){
      batteryPct=E.getBattery();
      batterySampleAt=now;
    }
  }

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function norm(a){a%=TAU;return a<0?a+TAU:a;}
  function wrapPi(a){a=norm(a);return a>PI?a-TAU:a;}
  function toDays(date){return date.valueOf()/DAY-0.5+J1970-J2000;}
  function f2(n){return ("0"+n).substr(-2);}
  function eraYear(d){
    var y=d.getFullYear();
    return y>=2019 ? "R"+(y-2018) : ""+y;
  }
  function headerText(d){
    return eraYear(d)+"/"+f2(d.getMonth()+1)+"/"+f2(d.getDate())+" "+f2(d.getHours())+":"+f2(d.getMinutes())+" ."+batteryPct;
  }
  var FONT3={
    "0":[7,5,5,5,5,5,7],"1":[2,6,2,2,2,2,7],"2":[7,1,1,7,4,4,7],
    "3":[7,1,1,7,1,1,7],"4":[5,5,5,7,1,1,1],"5":[7,4,4,7,1,1,7],
    "6":[7,4,4,7,5,5,7],"7":[7,1,1,2,2,2,2],"8":[7,5,5,7,5,5,7],
    "9":[7,5,5,7,1,1,7],"R":[6,5,5,6,5,5,5],"B":[6,5,5,6,5,5,6],
    "/":[1,1,1,2,4,4,4],":":[0,2,2,0,2,2,0],"%":[5,1,2,2,4,4,5],".":[0,2,7,7,2,0,0]," ":[0,0,0,0,0,0,0],
    "-":[0,0,0,7,0,0,0],"+":[0,2,2,7,2,2,0],"H":[5,5,5,7,5,5,5]
  };
  function drawTallBoldString(str,y,fg,bg){
    var adv=8, pw=2, ph=3, total=str.length*adv-2;
    var x=Math.floor((W-total)/2);
    g.setColor(bg).fillRect(0,y-1,W-1,y+21);
    g.setColor(fg);
    for(var i=0;i<str.length;i++){
      var rows=FONT3[str[i]]||FONT3[" "];
      for(var ry=0;ry<7;ry++){
        var bits=rows[ry];
        for(var rx=0;rx<3;rx++) if(bits&(4>>rx)){
          var px=x+i*adv+rx*pw, py=y+ry*ph;
          g.fillRect(px,py,px+pw-1,py+ph-1);
        }
      }
    }
  }

  function sunLon(date){
    var d=toDays(date), M=RAD*(357.5291+0.98560028*d);
    var cc=RAD*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M));
    return norm(M+cc+RAD*102.9372+PI);
  }
  function sunEquFromLon(l){
    var e=RAD*23.4397;
    return {ra:Math.atan2(Math.sin(l)*Math.cos(e),Math.cos(l)),dec:Math.asin(Math.sin(e)*Math.sin(l))};
  }
  function dayOfYear(date){
    var jan1=new Date(date.getFullYear(),0,1,0,0,0,0);
    return Math.floor((date.valueOf()-jan1.valueOf())/DAY)+1;
  }
  // Local apparent-solar hour angle for Japanese standard time.
  // At local solar noon this is 0, so the red location marker lies on the Sun-facing meridian.
  function localSolarHourAngle(date){
    var n=dayOfYear(date);
    var b=TAU*(n-81)/364;
    var eot=9.87*Math.sin(2*b)-7.53*Math.cos(b)-1.5*Math.sin(b); // minutes
    var civilMin=date.getHours()*60+date.getMinutes()+date.getSeconds()/60;
    var solarMin=civilMin + 4*(loc.lon-135) + eot; // JST standard meridian = 135E
    return wrapPi((solarMin-720)*0.25*RAD);
  }

  function moonGeo(date){
    var d=toDays(date);
    var L=RAD*(218.3164477+13.17639648*d);
    var D=RAD*(297.8501921+12.19074912*d);
    var M=RAD*(357.5291092+0.98560028*d);
    var Mp=RAD*(134.9633964+13.06499295*d);
    var F=RAD*(93.2720950+13.22935024*d);
    var lon=L+RAD*(6.289*Math.sin(Mp)+1.274*Math.sin(2*D-Mp)+0.658*Math.sin(2*D)+0.214*Math.sin(2*Mp)-0.186*Math.sin(M)-0.114*Math.sin(2*F)+0.059*Math.sin(2*D-2*Mp)+0.057*Math.sin(2*D-M-Mp)+0.053*Math.sin(2*D+Mp)+0.046*Math.sin(2*D-M)+0.041*Math.sin(M-Mp)-0.035*Math.sin(D)-0.031*Math.sin(M+Mp));
    var lat=RAD*(5.128*Math.sin(F)+0.280*Math.sin(Mp+F)+0.277*Math.sin(Mp-F)+0.173*Math.sin(2*D-F)+0.055*Math.sin(2*D-Mp+F)+0.046*Math.sin(2*D-Mp-F)+0.033*Math.sin(2*D+F));
    var dist=385000.56-20905.355*Math.cos(Mp)-3699.111*Math.cos(2*D-Mp)-2955.968*Math.cos(2*D)-569.925*Math.cos(2*Mp);
    return {lon:norm(lon),lat:lat,dist:dist};
  }
  function phaseAngle(date){return norm(moonGeo(date).lon-sunLon(date));}

  function sceneDate(){ return new Date(Date.now()+timeOffsetMs); }
  function currentLabel(){
    if(timeOffsetMs) return (timeOffsetMs>0?"+":"")+Math.round(timeOffsetMs/3600000)+"H";
    return "NOW";
  }

  function drawHeader(date){
    var isNow=(timeOffsetMs===0);
    drawTallBoldString(headerText(date),1,isNow?C.bg:C.fg,isNow?C.nowBg:C.shiftBg);
  }

  function drawSun(){
    g.setColor(C.flare);
    for(var i=0;i<10;i++){
      var a=i*TAU/10,r1=settings.sunSize+1,r2=settings.sunSize+3+(i%3);
      g.drawLine(Math.round(SX+Math.cos(a)*r1),Math.round(SY+Math.sin(a)*r1),Math.round(SX+Math.cos(a)*r2),Math.round(SY+Math.sin(a)*r2));
    }
    g.setColor(C.sun).fillCircle(SX,SY,settings.sunSize);
    g.setColor(C.flare).fillCircle(SX-Math.round(settings.sunSize/3),SY-Math.round(settings.sunSize/3),Math.max(1,Math.round(settings.sunSize/4)));
  }

  function solarReference(date,eq){
    var lat=loc.lat*RAD;
    var sunAng=Math.atan2(SY-EY,SX-EX);
    var c=-Math.tan(lat)*Math.tan(eq.dec);
    var h0=Math.acos(clamp(c,-1,1));
    var len=settings.earthSize+17;
    function ray(a,color){
      g.setColor(color).drawLine(EX,EY,Math.round(EX+Math.cos(a)*len),Math.round(EY+Math.sin(a)*len));
    }
    g.setColor(C.noon).drawLine(EX,EY,SX,SY);
    ray(sunAng-h0,C.rise);
    ray(sunAng+h0,C.set);
    return {sunAng:sunAng,eq:eq};
  }

  // Fast scanline fill: O(radius) draw calls instead of O(radius^2) setPixel calls.
  function fillLitHalf(cx,cy,r,ux,uy,color){
    g.setColor(color);
    for(var yy=-r;yy<=r;yy++){
      var xmax=Math.floor(Math.sqrt(Math.max(0,r*r-yy*yy)));
      var x0=-xmax, x1=xmax;
      if(Math.abs(ux)<0.0001){
        if(yy*uy<0) continue;
      } else {
        var cut=-yy*uy/ux;
        if(ux>0) x0=Math.max(x0,Math.ceil(cut));
        else x1=Math.min(x1,Math.floor(cut));
      }
      if(x0<=x1) g.drawLine(cx+x0,cy+yy,cx+x1,cy+yy);
    }
  }

  function eraseMoonFarHalf(cx,cy,r){
    var ux=EX-cx, uy=EY-cy;
    var len=Math.sqrt(ux*ux+uy*uy)||1;
    ux/=len; uy/=len;
    // Delete the hemisphere facing away from Earth.
    fillLitHalf(cx,cy,r,-ux,-uy,C.bg);
  }

  function drawMoonEarthFacingArc(cx,cy,r){
    var a0=Math.atan2(EY-cy,EX-cx)-PI/2;
    var steps=Math.max(12,r*4);
    var px=Math.round(cx+r*Math.cos(a0));
    var py=Math.round(cy+r*Math.sin(a0));
    for(var i=1;i<=steps;i++){
      var a=a0+PI*i/steps;
      var x=Math.round(cx+r*Math.cos(a));
      var y=Math.round(cy+r*Math.sin(a));
      g.drawLine(px,py,x,y);
      px=x; py=y;
    }
  }

  function fillDiskIntersection(cx,cy,r,ox,oy,sr,color){
    if(sr<=0)return;
    g.setColor(color);
    for(var yy=-r;yy<=r;yy++){
      var mh=Math.floor(Math.sqrt(Math.max(0,r*r-yy*yy)));
      var sy=yy-oy;
      if(Math.abs(sy)>sr) continue;
      var sh=Math.sqrt(Math.max(0,sr*sr-sy*sy));
      var x0=Math.max(-mh,Math.ceil(ox-sh));
      var x1=Math.min(mh,Math.floor(ox+sh));
      if(x0<=x1) g.drawLine(cx+x0,cy+yy,cx+x1,cy+yy);
    }
  }

  function drawThickLine2(x0,y0,x1,y1){
    var dx=x1-x0,dy=y1-y0;
    var l=Math.sqrt(dx*dx+dy*dy)||1;
    var ox=Math.round(-dy/l),oy=Math.round(dx/l);
    g.drawLine(x0,y0,x1,y1);
    g.drawLine(x0+ox,y0+oy,x1+ox,y1+oy);
  }

  function drawEarth(date,ref,moonOrbitR){
    var r=settings.earthSize;
    var ux=SX-EX, uy=SY-EY, len=Math.sqrt(ux*ux+uy*uy)||1;
    ux/=len; uy/=len;

    // Fast day/night disk: night black, Sun-facing half light blue.
    g.setColor(C.bg).fillCircle(EX,EY,r);
    fillLitHalf(EX,EY,r,ux,uy,C.earth);
    g.setColor(C.earth).drawCircle(EX,EY,r);

    var ha=localSolarHourAngle(date);
    var a=ref.sunAng+ha;
    var d=r*Math.cos(loc.lat*RAD);
    var px=EX+d*Math.cos(a), py=EY+d*Math.sin(a);

    // Observer radial direction in this north-polar schematic.
    var rx=px-EX, ry=py-EY;
    var radial=Math.sqrt(rx*rx+ry*ry) || 1;
    var zx=rx/radial, zy=ry/radial;

    // Local horizon: perpendicular to the observer's zenith and extended
    // beyond Earth so it remains unmistakable on the watch display.
    var hx=-zy, hy=zx;
    var horizonHalf=settings.earthSize+8;
    g.setColor(C.horizon).drawLine(
      Math.round(px-hx*horizonHalf),Math.round(py-hy*horizonHalf),
      Math.round(px+hx*horizonHalf),Math.round(py+hy*horizonHalf));

    // Local zenith: starts at the observer and extends strictly outward from Earth.
    var toOrbit=Math.max(4,moonOrbitR-radial);
    var zenLen=2*toOrbit;
    var x0=Math.round(px), y0=Math.round(py);
    var x1=Math.round(px+zx*zenLen), y1=Math.round(py+zy*zenLen);
    g.setColor(C.zenith);
    drawThickLine2(x0,y0,x1,y1);

    g.setColor(C.marker).fillCircle(x0,y0,settings.markerSize);
    return {x:x0,y:y0};
  }

  function shadowGeometry(m,s,r){
    var dx=wrapPi(m.lon-norm(s+PI)),dy=m.lat;
    var moonAng=Math.asin(1737.4/m.dist);
    var ru=6378.1-m.dist*(696340-6378.1)/149597870;
    var rp=6378.1+m.dist*(696340+6378.1)/149597870;
    return {ox:-dx/moonAng*r,oy:dy/moonAng*r,ur:Math.max(0,Math.atan(ru/m.dist)/moonAng*r),pr:Math.atan(rp/m.dist)/moonAng*r};
  }

  function drawMoon(mx,my,m,s){
    // Sun is effectively at infinity on the Earth-Moon scale:
    // use one parallel sunlight direction for both Earth and Moon.
    var r=settings.moonSize, ux=SX-EX,uy=SY-EY,len=Math.sqrt(ux*ux+uy*uy)||1;
    ux/=len;uy/=len;

    g.setColor(C.bg).fillCircle(mx,my,r);
    fillLitHalf(mx,my,r,ux,uy,C.moon);

    // Eclipse shadow using scanline-circle intersections instead of per-pixel tests.
    var sh=shadowGeometry(m,s,r);
    fillDiskIntersection(mx,my,r,sh.ox,sh.oy,sh.pr,C.penumbra);
    fillDiskIntersection(mx,my,r,sh.ox,sh.oy,sh.ur,C.bg);

    // Remove the complete Earth-far hemisphere, including its outer rim.
    eraseMoonFarHalf(mx,my,r);

    // Draw only the outer rim of the hemisphere that faces Earth.
    g.setColor(C.moon);
    drawMoonEarthFacingArc(mx,my,r);
  }

  function draw(){
    var date=sceneDate();
    var sLon=sunLon(date);
    var mGeo=moonGeo(date);
    var phase=norm(mGeo.lon-sLon);
    var eq=sunEquFromLon(sLon);
    var sunAng=Math.atan2(SY-EY,SX-EX);
    var moonOrbitR=settings.earthSize+settings.moonSize+5;
    var ma=sunAng+phase;
    var mx=Math.round(EX+moonOrbitR*Math.cos(ma));
    var my=Math.round(EY+moonOrbitR*Math.sin(ma));
    g.setBgColor(C.bg).setColor(C.bg).clear();
    drawHeader(date);
    g.setFont("6x8",1).setFontAlign(0,-1).setColor(C.fg).drawString(currentLabel(),W/2,24);
    g.setColor(C.orbit).drawCircle(EX,EY,moonOrbitR);
    var ref=solarReference(date,eq);
    drawSun();
    drawEarth(date,ref,moonOrbitR);
    drawMoon(mx,my,mGeo,sLon);
    g.setColor(C.fg).setFont("6x8",1).setFontAlign(1,0);
    g.drawString(loc.pref,W-1,H-17);
    g.drawString(loc.name,W-1,H-8);
  }

  function armIdle(){
    if(idleTimer) clearTimeout(idleTimer);
    if(!interactive) return;
    idleTimer=setTimeout(goIdle,8000);
  }
  function startInteraction(){
    interactive=true;
    try { Bangle.setLocked(false); } catch(e) {}
    try { Bangle.setBacklight(true); } catch(e) {}
    armIdle();
  }
  function goIdle(){
    if(idleTimer){ clearTimeout(idleTimer); idleTimer=undefined; }
    stopHold();
    cancelPendingEdgeTap();
    edgeDownDir=0;
    interactive=false;
    timeOffsetMs=0;
    lastCenterTap=0;
    try { Bangle.setBacklight(false); } catch(e) {}
    try { Bangle.setLocked(true); } catch(e) {}
    draw();
    queueTick();
  }
  function onFaceUp(up){
    if(up){
      startInteraction();
      draw();
    }
  }

  function stepHour(dir){
    timeOffsetMs += dir*3600000;
    draw();
  }
  function cancelPendingEdgeTap(){
    if(edgeTapTimer){ clearTimeout(edgeTapTimer); edgeTapTimer=undefined; }
    pendingEdgeDir=0;
  }
  function stopHold(){
    holdDir=0;
    if(holdTimer){ clearTimeout(holdTimer); holdTimer=undefined; }
  }
  function repeatHold(){
    if(!holdDir || edgeDownDir!==holdDir) return;
    // Safety valve: never allow a lost release event to fast-forward forever.
    if(Date.now()-edgeDownAt>30000){
      stopHold();
      edgeDownDir=0;
      return;
    }
    armIdle();
    stepHour(holdDir);
    holdTimer=setTimeout(repeatHold,700);
  }
  function startHold(dir){
    if(edgeDownDir!==dir) return;
    cancelPendingEdgeTap();
    stopHold();
    holdDir=dir;
    armIdle();
    stepHour(dir);
    holdTimer=setTimeout(repeatHold,700);
  }
  function handleEdgeTouch(dir,type){
    startInteraction();
    // Firmware classifies short touches as type 0 and long touches as type 2.
    if(type===2){
      cancelPendingEdgeTap();
      edgeDownDir=dir;
      edgeDownAt=Date.now();
      startHold(dir);
      return;
    }
    // Swift touch: wait briefly before committing one hour, so a second
    // swift touch can turn the pair into exactly one day.
    edgeDownDir=0;
    stopHold();
    registerEdgeTap(dir);
  }
  function registerEdgeTap(dir){
    armIdle();
    if(pendingEdgeDir===dir && edgeTapTimer){
      clearTimeout(edgeTapTimer);
      edgeTapTimer=undefined;
      pendingEdgeDir=0;
      timeOffsetMs += dir*DAY;
      draw();
      return;
    }
    if(pendingEdgeDir && edgeTapTimer){
      var oldDir=pendingEdgeDir;
      clearTimeout(edgeTapTimer);
      edgeTapTimer=undefined;
      pendingEdgeDir=0;
      stepHour(oldDir);
    }
    pendingEdgeDir=dir;
    edgeTapTimer=setTimeout(function(){
      edgeTapTimer=undefined;
      var d=pendingEdgeDir;
      pendingEdgeDir=0;
      if(d) stepHour(d);
    },420);
  }

  function onDrag(e){
    if(e.b) armIdle();
    if(!e.b){
      dragActive=false;
      edgeDownDir=0;
      stopHold();
      return;
    }
    if(edgeDownDir){
      if((edgeDownDir<0 && e.x>=W*0.35) || (edgeDownDir>0 && e.x<=W*0.65)){
        edgeDownDir=0;
        stopHold();
      }
    }
  }

  function onTouch(zone,e){
    if(!e)return;
    startInteraction();
    if(e.x<W*0.28){
      handleEdgeTouch(-1,e.type);
      return;
    }
    if(e.x>W*0.72){
      handleEdgeTouch(1,e.type);
      return;
    }
    cancelPendingEdgeTap();
    edgeDownDir=0;
    stopHold();
    var now=Date.now();
    if(now-lastCenterTap<450){
      timeOffsetMs=0;
      lastCenterTap=0;
      draw();
    } else {
      lastCenterTap=now;
    }
  }

  function queueTick(){
    if(tickTimer)clearTimeout(tickTimer);
    var step=5*60000;
    var wait=step-(Date.now()%step)+20;
    tickTimer=setTimeout(function(){
      tickTimer=undefined;
      if(!interactive){
        timeOffsetMs=0;
        refreshBattery();
        draw();
      }
      queueTick();
    },wait);
  }
  function onLCD(on){
    if(on){
      draw();
      queueTick();
    } else {
      stopHold();
      if(idleTimer){clearTimeout(idleTimer);idleTimer=undefined;}
      interactive=false;
            timeOffsetMs=0;
      if(tickTimer){clearTimeout(tickTimer);tickTimer=undefined;}
    }
  }
  function cleanup(){
    stopHold();
    cancelPendingEdgeTap();
    edgeDownDir=0;
    if(idleTimer)clearTimeout(idleTimer);
    if(tickTimer)clearTimeout(tickTimer);
    Bangle.removeListener("drag",onDrag);
    Bangle.removeListener("touch",onTouch);
    Bangle.removeListener("lcdPower",onLCD);
    Bangle.removeListener("faceUp",onFaceUp);
  }

  Bangle.setUI({mode:"clock",remove:cleanup});
  Bangle.on("drag",onDrag);
  Bangle.on("touch",onTouch);
  Bangle.on("lcdPower",onLCD);
  Bangle.on("faceUp",onFaceUp);

  try { Bangle.setBacklight(false); } catch(e) {}
  try { Bangle.setLocked(true); } catch(e) {}
  draw();
  queueTick();
})();

} catch (e) {
  try { require("Storage").write("orbit.err", String(e)); } catch (x) {}
  try {
    g.reset().clear();
    g.setFont("6x8",2).setFontAlign(0,0).drawString("Orbit error",g.getWidth()/2,65);
    g.setFont("6x8",1).drawString(String(e).substr(0,42),g.getWidth()/2,90);
    Bangle.setUI({mode:"clock"});
  } catch (x2) {}
}
