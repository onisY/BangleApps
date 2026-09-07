(function () {
  var Storage = require("Storage");
  var FILE = "orbit.json";
  var W = g.getWidth(), H = g.getHeight();
  var PI = Math.PI, TAU = PI*2, RAD = PI/180;
  var DAY = 86400000, J1970 = 2440588, J2000 = 2451545;
  var SYNODIC = 29.530588853;
  var PHASE_ANCHOR = Date.UTC(2000,0,6,18,14,0);

  var SX = 137, SY = 51;
  var EX = 50, EY = 117;
  var MOON_ORBIT_R = 29;
  var SLIDER_X0 = 10, SLIDER_X1 = W-10, SLIDER_Y = H-8;

  var def = {
    locPref:"Tokyo",locName:"Tokyo",lat:35.681,lon:139.767,
    sunSize:10,earthSize:12,moonSize:6,markerSize:2
  };
  var settings = Storage.readJSON(FILE,1) || {};
  Object.keys(def).forEach(function(k){ if (settings[k]===undefined) settings[k]=def[k]; });
  var loc = {name:settings.locName,lat:settings.lat,lon:settings.lon,pref:settings.locPref};

  var C = {bg:"#000",fg:"#fff",sun:"#f22",flare:"#f80",earth:"#5cf",earthEdge:"#9ef",
           marker:"#f00",horizon:"#a4f",moon:"#fd4",orbit:"#555",rise:"#ff0",set:"#f80",
           noon:"#ccc",penumbra:"#631",slider:"#777"};
  var events = null, sliderIndex = 0, dragActive = false, tickTimer;

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function norm(a){a%=TAU;return a<0?a+TAU:a;}
  function wrapPi(a){a=norm(a);return a>PI?a-TAU:a;}
  function toDays(date){return date.valueOf()/DAY-0.5+J1970-J2000;}
  function f2(n){return ("0"+n).substr(-2);}
  function formatDate(d){return d.getFullYear()+"/"+f2(d.getMonth()+1)+"/"+f2(d.getDate())+" "+f2(d.getHours())+":"+f2(d.getMinutes());}

  function sunLon(date){
    var d=toDays(date), M=RAD*(357.5291+0.98560028*d);
    var cc=RAD*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M));
    return norm(M+cc+RAD*102.9372+PI);
  }
  function sunEqu(date){
    var l=sunLon(date), e=RAD*23.4397;
    return {ra:Math.atan2(Math.sin(l)*Math.cos(e),Math.cos(l)),dec:Math.asin(Math.sin(e)*Math.sin(l))};
  }
  function gmst(date){
    var jd=date.valueOf()/DAY+2440587.5, T=(jd-2451545.0)/36525;
    return norm((280.46061837+360.98564736629*(jd-2451545.0)+0.000387933*T*T-T*T*T/38710000)*RAD);
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
    [Date.UTC(2027,1,6,16,0,48),"SOL ANNULAR","solar"],
    [Date.UTC(2027,1,20,23,14,6),"LUN PENUMBRAL","lunar"],
    [Date.UTC(2027,6,18,16,4,9),"LUN PENUMBRAL","lunar"],
    [Date.UTC(2027,7,2,10,7,50),"SOL TOTAL","solar"],
    [Date.UTC(2027,7,17,7,14,59),"LUN PENUMBRAL","lunar"],
    [Date.UTC(2028,0,12,4,14,13),"LUN PARTIAL","lunar"]
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

  function sceneDate(){return sliderIndex?new Date(events[sliderIndex-1].t):new Date();}
  function currentLabel(){return sliderIndex?events[sliderIndex-1].label:"NOW";}

  function drawHeader(date){
    var ev=sliderIndex>0;
    g.setColor(ev?C.fg:C.bg).fillRect(0,0,W-1,17);
    g.setColor(ev?C.bg:C.fg).setFont("6x8",1).setFontAlign(-1,0).drawString(formatDate(date),2,8);
    g.setFontAlign(1,0).drawString("B"+E.getBattery()+"%",W-2,8);
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

  function solarReference(date){
    var eq=sunEqu(date), lat=loc.lat*RAD;
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

  function drawEarth(date,ref){
    var r=settings.earthSize;
    g.setColor(C.earth).fillCircle(EX,EY,r);
    g.setColor(C.earthEdge).drawCircle(EX,EY,r);
    var ha=wrapPi(gmst(date)+loc.lon*RAD-ref.eq.ra);
    var a=ref.sunAng+ha;
    var d=r*Math.cos(loc.lat*RAD);
    var px=EX+d*Math.cos(a), py=EY+d*Math.sin(a);
    var half=Math.sqrt(Math.max(0,r*r-d*d));
    var vx=-Math.sin(a),vy=Math.cos(a);
    g.setColor(C.horizon).drawLine(Math.round(px-half*vx),Math.round(py-half*vy),Math.round(px+half*vx),Math.round(py+half*vy));
    g.setColor(C.marker).fillCircle(Math.round(px),Math.round(py),settings.markerSize);
  }

  function shadowGeometry(date,r){
    var m=moonGeo(date), s=sunLon(date);
    var dx=wrapPi(m.lon-norm(s+PI)),dy=m.lat;
    var moonAng=Math.asin(1737.4/m.dist);
    var ru=6378.1-m.dist*(696340-6378.1)/149597870;
    var rp=6378.1+m.dist*(696340+6378.1)/149597870;
    return {ox:-dx/moonAng*r,oy:dy/moonAng*r,ur:Math.max(0,Math.atan(ru/m.dist)/moonAng*r),pr:Math.atan(rp/m.dist)/moonAng*r};
  }

  function drawMoon(mx,my,date){
    var r=settings.moonSize, ux=SX-mx,uy=SY-my,len=Math.sqrt(ux*ux+uy*uy)||1;
    ux/=len;uy/=len;
    g.setColor(C.bg).fillCircle(mx,my,r);
    g.setColor(C.moon);
    var yy,xx,xmax;
    for(yy=-r;yy<=r;yy++){
      xmax=Math.floor(Math.sqrt(Math.max(0,r*r-yy*yy)));
      for(xx=-xmax;xx<=xmax;xx++)if(xx*ux+yy*uy>=0)g.setPixel(mx+xx,my+yy);
    }
    var sh=shadowGeometry(date,r);
    for(yy=-r;yy<=r;yy++){
      xmax=Math.floor(Math.sqrt(Math.max(0,r*r-yy*yy)));
      for(xx=-xmax;xx<=xmax;xx++){
        var ds=(xx-sh.ox)*(xx-sh.ox)+(yy-sh.oy)*(yy-sh.oy);
        if(ds<=sh.ur*sh.ur)g.setColor(C.bg).setPixel(mx+xx,my+yy);
        else if(ds<=sh.pr*sh.pr)g.setColor(C.penumbra).setPixel(mx+xx,my+yy);
      }
    }
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
    var phase=phaseAngle(date);
    var sunAng=Math.atan2(SY-EY,SX-EX);
    var ma=sunAng+phase;
    var mx=Math.round(EX+MOON_ORBIT_R*Math.cos(ma));
    var my=Math.round(EY+MOON_ORBIT_R*Math.sin(ma));
    g.setBgColor(C.bg).setColor(C.bg).clear();
    drawHeader(date);
    g.setFont("6x8",1).setFontAlign(0,-1).setColor(sliderIndex?C.moon:C.fg).drawString(currentLabel(),W/2,20);
    g.setColor(C.orbit).drawCircle(EX,EY,MOON_ORBIT_R);
    var ref=solarReference(date);
    drawSun();
    drawEarth(date,ref);
    drawMoon(mx,my,date);
    g.setColor(C.fg).setFont("6x8",1).setFontAlign(0,0).drawString(loc.pref+" / "+loc.name,W/2,151);
    drawSlider();
  }

  function setSliderFromX(x){
    if(!events) generateEvents();
    if(!events.length){sliderIndex=0;draw();return;}
    var idx=Math.round(clamp((x-SLIDER_X0)/(SLIDER_X1-SLIDER_X0),0,1)*events.length);
    if(idx!==sliderIndex){sliderIndex=idx;draw();}
  }
  function onDrag(e){
    if(e.b&&(dragActive||e.y>=H-30)){dragActive=true;setSliderFromX(e.x);}else if(!e.b)dragActive=false;
  }
  function onTouch(zone,e){if(e&&e.y>=H-30)setSliderFromX(e.x);}

  function queueTick(){
    if(tickTimer)clearTimeout(tickTimer);
    var wait=60000-(Date.now()%60000)+20;
    tickTimer=setTimeout(function(){
      tickTimer=undefined;
      if(!sliderIndex && (new Date()).getMinutes()%5!==0)drawHeader(new Date()); else draw();
      queueTick();
    },wait);
  }
  function onLCD(on){if(on){draw();queueTick();}else if(tickTimer){clearTimeout(tickTimer);tickTimer=undefined;}}
  function cleanup(){
    if(tickTimer)clearTimeout(tickTimer);
    Bangle.removeListener("drag",onDrag);
    Bangle.removeListener("touch",onTouch);
    Bangle.removeListener("lcdPower",onLCD);
  }

  Bangle.setUI({mode:"clock",remove:cleanup});
  Bangle.on("drag",onDrag);
  Bangle.on("touch",onTouch);
  Bangle.on("lcdPower",onLCD);

  draw();
  queueTick();
})();
