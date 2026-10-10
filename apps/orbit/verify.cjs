const assert=require("assert"),fs=require("fs"),vm=require("vm");
const rad=x=>x*Math.PI/180,deg=x=>x*180/Math.PI;
const src=fs.readFileSync(__dirname+"/app.js","utf8");
const section=src.slice(src.indexOf("  /* Eclipse Predictions"),src.indexOf("  function drawObserver"));
const eclipseShadow=new Function("rad","deg",section+";return eclipseShadow;")(rad,deg);
const cases=[
["2021-12-04T07:33:28.2Z",-76-47/60,-46-9.7/60],
["2024-04-08T18:17:18.3Z",25+17.2/60,-104-8.3/60],
["2026-08-12T17:45:53.8Z",65+13.5/60,-25-13.7/60],
["2027-08-02T10:06:37.7Z",25+30.3/60,33+11/60],
["2028-07-22T02:55:26.9Z",-15-34.4/60,126+42.4/60],
["2030-11-25T06:50:19.2Z",-43-36.8/60,71+14.5/60]
];
for(const [date,lat,lon] of cases){
const p=eclipseShadow(Date.parse(date));assert(p,date);
console.log(date,JSON.stringify(p));
assert(Math.abs(p.lat-lat)<0.03,date+" latitude");
assert(Math.abs(p.lon-lon)<0.03,date+" longitude");
assert(!eclipseShadow(Date.parse(date)+86400000));
}
for(const date of ["2026-10-10T12:00Z","2023-04-20T04:17Z","2024-10-02T18:45Z","2031-01-01T00:00Z"])assert(!eclipseShadow(Date.parse(date)),date);
new vm.Script(src);
console.log("Six NASA reference positions and out-of-event guards passed; app syntax passed.");
const actual=new Function("rad","deg",section+";return eclipseShadow;")(rad,deg);
for(const [date,lat,lon] of cases){
  const p=actual(Date.parse(date));
  assert(Math.abs(p.lat-lat)<0.03);assert(Math.abs(p.lon-lon)<0.03);
  assert(!actual(Date.parse(date)+86400000));
}
const observer=src.slice(src.indexOf("  function drawObserver"),src.indexOf("  function drawSatelliteIcon"));
const rise=src.slice(src.indexOf("  function riseSetHourAngle"),src.indexOf("  function buildSunCache"));
for(const lat of [35,0,90,-90])for(const south of [false,true])for(const el of [-20,-0.001,0,0.001,45]){
  const fills=[],g={color:0,setColor(c){this.color=c;return this;},fillPoly(){fills.push(this.color);return this;},drawLine(){return this;},fillCircle(){return this;}};
  new Function("g","rad","VIEW_SOUTH","TESTLAT","el",
    "var EARTHX=88,EARTHY=88,EARTHR=35,SUNX=145,SUNY=30,MOONORBIT=60,MOONR=8,YELLOW=65504,RED=63488,lastObserverDay;"+
    rise+observer+";drawObserver({el:el,ha:0.3,dec:0.2});")(g,rad,south,lat,el);
  assert.equal(fills[0],el>=0?2016:65504);
}
for(const south of [false,true]){
  const pixels=[],g={setColor(){return this;},setPixel(x,y){pixels.push([x,y]);}};
  new Function("g","rad","deg","VIEW_SOUTH",
    'var BLACK=0,EARTHR=35,EARTHX=88,EARTHY=88,SUNANG=0,TESTLON=0;function virtualNowMs(){return Date.parse("2026-08-12T17:45:53.8Z");}'+
    section+";drawEclipseShadow({ha:0});")(g,rad,deg,south);
  if(south)assert.equal(pixels.length,0);else assert(pixels.length>0);
  for(const [x,y] of pixels)assert((x-88)**2+(y-88)**2<=35**2);
}
console.log("Actual app passed: NASA positions, 40 color cases, hemisphere and clipping.");

