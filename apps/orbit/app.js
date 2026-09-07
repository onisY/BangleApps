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

  var SX = 143, SY = 55;
  var EX = 62, EY = 96;
  var SLIDER_X0 = 10, SLIDER_X1 = W-10, SLIDER_Y = H-16;

  var def = {
    locPref:"Tokyo",locName:"Tokyo",lat:35.681,lon:139.767,
    sunSize:6,earthSize:30,moonSize:9,markerSize:2
  };
  var settings = Storage.readJSON(FILE,1) || {};
  Object.keys(def).forEach(function(k){ if (settings[k]===undefined) settings[k]=def[k]; });
  var loc = {name:settings.locName,lat:settings.lat,lon:settings.lon,pref:settings.locPref};

  var C = {bg:"#000",fg:"#fff",sun:"#f22",flare:"#f80",earth:"#5cf",earthEdge:"#9ef",
           marker:"#f00",horizon:"#a4f",moon:"#fd4",orbit:"#555",rise:"#ff0",set:"#f80",
           noon:"#ccc",penumbra:"#631",slider:"#777",nowBg:"#0f0",shiftBg:"#f00",zenith:"#0f0"};
  var events = null, sliderIndex = 0, dragActive = false, tickTimer, timeOffsetMs = 0, lastCenterTap = 0;
  var holdTimer, holdStartTimer, holdDir = 0, edgeDownDir = 0, edgeDownAt = 0;
  var edgeTapTimer, pendingEdgeDir = 0;
  var interactive = false, idleTimer;

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
    return eraYear(d)+"/"+f2(d.getMonth()+1)+"/"+f2(d.getDate())+" "+f2(d.getHours())+":"+f2(d.getMinutes())+" \u2022"+E.getBattery();
  }
  var FONT3={
    "0":[7,5,5,5,5,5,7],"1":[2,6,2,2,2,2,7],"2":[7,1,1,7,4,4,7],
    "3":[7,1,1,7,1,1,7],"4":[5,5,5,7,1,1,1],"5":[7,4,4,7,1,1,7],
    "6":[7,4,4,7,5,5,7],"7":[7,1,1,2,2,2,2],"8":[7,5,5,7,5,5,7],
    "9":[7,5,5,7,1,1,7],"R":[6,5,5,6,5,5,5],"B":[6,5,5,6,5,5,6],
    "/":[1,1,1,2,4,4,4],":":[0,2,2,0,2,2,0],"%":[5,1,2,2,4,4,5]," ":[0,0,0,0,0,0,0],
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

  var eclipseTable=[
    [utc(2027,1,6,16,0,48),"SOL ANNULAR","solar"],
    [utc(2027,1,20,23,14,6),"LUN PENUMBRAL","lunar"],
    [utc(2027,6,18,16,4,9),"LUN PENUMBRAL","lunar"],
    [utc(2027,7,2,10,7,50),"SOL TOTAL","solar"],
    [utc(2027,7,17,7,14,59),"LUN PENUMBRAL","lunar"],
    [utc(2028,0,12,4,14,13),"LUN PARTIAL","lunar"]
  ];
  var midAutumn={2026:[8,25],2027:[8,15],2028:[9,3]};

  function generateEvents(){
    var start=Date.now(), endDate=new Date(start); endDate.setFullYear(endDate.getFullYear()+1);
    var end=endDate.getTime(), qms=SYNODIC*DAY/4;
    var k0=Math.floor((start-PHASE_ANCHOR)/qms)-1;
    var names=["NEW MOON","FIRST QUARTER","FULL MOON","LAST QUARTER"], tmp=[];
    var k,idx,t;
    for(k=k0;k<k0+56;k++){
      idx=((k%4)+4)%4; t=PHASE_ANCHOR+k*qms;
      if(t>=start && t<=end) tmp.push({t:t,label:names[idx],kind:"phase",phase:idx});
    }
    eclipseTable.forEach(function(e){
      if(e[0]<start||e[0]>end)return;
      tmp=tmp.filter(function(x){return !(x.kind==="phase"&&(x.phase===0||x.phase===2)&&Math.abs(x.t-e[0])<24*3600000);});
      tmp.push({t:e[0],label:e[1],kind:e[2]});
    });
    var y0=new Date(start).getFullYear(),y1=new Date(end).getFullYear();
    for(var y=y0;y<=y1;y++){
      var md=midAutumn[y]; if(!md)continue;
      t=new Date(y,md[0],md[1],20,0,0,0).getTime();
      if(t>=start&&t<=end)tmp.push({t:t,label:"MID-AUTUMN",kind:"culture"});
    }
    tmp.sort(function(a,b){return a.t-b.t;}); events=tmp;
    if(sliderIndex>events.length)sliderIndex=events.length;
  }

  function sceneDate(){
    var base=sliderIndex?events[sliderIndex-1].t:Date.now();
    return new Date(base+timeOffsetMs);
  }
  function currentLabel(){
    if(sliderIndex) return events[sliderIndex-1].label;
    if(timeOffsetMs) return (timeOffsetMs>0?"+":"")+Math.round(timeOffsetMs/3600000)+"H";
    return "NOW";
  }

  function drawHeader(date){
    var isNow=(sliderIndex===0 && timeOffsetMs===0);
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
    var half=Math.sqrt(Math.max(0,r*r-d*d));
    var vx=-Math.sin(a),vy=Math.cos(a);
    g.setColor(C.horizon).drawLine(Math.round(px-half*vx),Math.round(py-half*vy),
      Math.round(px+half*vx),Math.round(py+half*vy));

    // Local zenith: starts at the observer and extends strictly outward from Earth.
    var rx=px-EX, ry=py-EY;
    var radial=Math.sqrt(rx*rx+ry*ry) || 1;
    var zx=rx/radial, zy=ry/radial;
    var toOrbit=Math.max(4,moonOrbitR-radial);
    var zenLen=2*toOrbit;
    var x0=Math.round(px), y0=Math.round(py);
    var x1=Math.round(px+zx*zenLen), y1=Math.round(py+zy*zenLen);
    g.setColor(C.zenith);
    drawThickLine2(x0,y0,x1,y1);

    g.setColor(C.marker).fillCircle(x0,y0,settings.markerSize);
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

    g.setColor(C.moon).drawCircle(mx,my,r);
  }

  function drawSlider(){
    var n=events?events.length:0,frac=n?sliderIndex/n:0;
    var x=Math.round(SLIDER_X0+frac*(SLIDER_X1-SLIDER_X0));
    g.setColor(C.slider).drawLine(SLIDER_X0,SLIDER_Y,SLIDER_X1,SLIDER_Y);
    g.drawLine(SLIDER_X0,SLIDER_Y-3,SLIDER_X0,SLIDER_Y+3);
    g.drawLine(SLIDER_X1,SLIDER_Y-3,SLIDER_X1,SLIDER_Y+3);
    g.setColor(sliderIndex?C.moon:C.fg).fillCircle(x,SLIDER_Y,4);
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
    g.setFont("6x8",1).setFontAlign(0,-1).setColor(sliderIndex?C.moon:C.fg).drawString(currentLabel(),W/2,24);
    g.setColor(C.orbit).drawCircle(EX,EY,moonOrbitR);
    var ref=solarReference(date,eq);
    drawSun();
    drawEarth(date,ref,moonOrbitR);
    drawMoon(mx,my,mGeo,sLon);
    g.setColor(C.fg).setFont("6x8",1).setFontAlign(1,0);
    g.drawString(loc.pref,W-3,H-43);
    g.drawString(loc.name,W-3,H-34);
    drawSlider();
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
    sliderIndex=0;
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
    if(holdStartTimer){ clearTimeout(holdStartTimer); holdStartTimer=undefined; }
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
  function beginEdgePress(dir,isLong){
    startInteraction();
    edgeDownDir=dir;
    edgeDownAt=Date.now();
    stopHold();
    if(isLong){
      startHold(dir);
    } else {
      holdStartTimer=setTimeout(function(){
        holdStartTimer=undefined;
        startHold(dir);
      },520);
    }
  }
  function finishEdgePress(){
    var dir=edgeDownDir;
    var wasHolding=!!holdDir;
    edgeDownDir=0;
    stopHold();
    if(!dir || wasHolding) return;
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

  function setSliderFromX(x){
    startInteraction();
    cancelPendingEdgeTap();
    edgeDownDir=0;
    stopHold();
    if(!events) generateEvents();
    if(!events.length){sliderIndex=0;draw();return;}
    var idx=Math.round(clamp((x-SLIDER_X0)/(SLIDER_X1-SLIDER_X0),0,1)*events.length);
    if(idx!==sliderIndex){sliderIndex=idx;timeOffsetMs=0;draw();}
  }
  function onDrag(e){
    if(e.b) armIdle();
    if(!e.b){
      dragActive=false;
      finishEdgePress();
      return;
    }
    if(dragActive || e.y>=H-44){
      edgeDownDir=0;
      stopHold();
      dragActive=true;
      setSliderFromX(e.x);
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
    if(e.y>=H-44){
      setSliderFromX(e.x);
      return;
    }
    if(e.x<W*0.28){
      beginEdgePress(-1,e.type===2);
      return;
    }
    if(e.x>W*0.72){
      beginEdgePress(1,e.type===2);
      return;
    }
    cancelPendingEdgeTap();
    edgeDownDir=0;
    stopHold();
    var now=Date.now();
    if(now-lastCenterTap<450){
      sliderIndex=0;
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
        sliderIndex=0;
        timeOffsetMs=0;
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
      sliderIndex=0;
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
