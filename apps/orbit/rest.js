/* tenkyu motion-rest recorder and 24-hour radial plot. MIT.
 * Time: absolute UTC milliseconds; bins: 300 s, 288 slots = exactly 24 h.
 * Bangle accel.diff is the vector change in g, accel.mag includes gravity.
 * A quiet sample requires diff <= threshold and abs(mag - 1 g) <= threshold.
 * See https://www.espruino.com/Reference#l_Bangle_accel .
 * No sensor polling changes, high-rate timers, HRM, or GPS requests.
 */
var SLOT_MS=300000,COUNT=288,DAY_MS=SLOT_MS*COUNT;
var CONFIRM_MS=10000,MAX_GAP_MS=2500,MIN_COVERAGE_MS=270000;
function thresholdG(v){return isFinite(v)?Math.max(0.01,Math.min(0.10,+v)):0.03;}
function levelFor(restMs,coveredMs){
  if(coveredMs<MIN_COVERAGE_MS)return 0; // 0 = missing, not level 1.
  return Math.max(1,Math.min(5,Math.ceil(5*restMs/coveredMs)));
}
function create(options){
  options=options||{};
  var levels=new Uint8Array(COUNT),stamps=new Uint32Array(COUNT);
  var threshold=thresholdG(options.thresholdG),save=options.onCommit;
  var current=-1,covered=0,rest=0,lastMs,lastQuiet=false,lastValid=false,quietSince;
  var old=options.saved,i,b,v;
  if(old&&old.v===1&&isFinite(old.end)&&typeof old.levels==="string"&&old.levels.length===COUNT){
    for(i=0;i<COUNT;i++){
      b=old.end-COUNT+1+i;v=+old.levels.charAt(i);
      if(b>=0&&v>=1&&v<=5){stamps[b%COUNT]=b;levels[b%COUNT]=v;}
    }
    // App switches preserve accumulated coverage, but never bridge an unseen gap.
    if(old.active&&old.active.bucket===Math.floor(options.nowMs/SLOT_MS)){
      current=old.active.bucket;
      covered=Math.max(0,Math.min(SLOT_MS,+old.active.covered||0));
      rest=Math.max(0,Math.min(covered,+old.active.rest||0));
    }
  }
  function roll(ms){
    var target=Math.floor(ms/SLOT_MS),changed=false;
    if(target===current)return false;
    if(current>=0&&target>current){
      i=current%COUNT;stamps[i]=current;levels[i]=levelFor(rest,covered);changed=true;
    }else if(current>=0&&target<current){
      // Clock correction: discard future bins so they cannot reappear later.
      for(i=0;i<COUNT;i++)if(stamps[i]>=target){stamps[i]=0;levels[i]=0;}
      quietSince=undefined;lastQuiet=false;changed=true;
    }
    current=target;covered=0;rest=0;
    if(changed&&save)save();
    return changed;
  }
  function sample(a,ms){
    if(!isFinite(ms)||ms<0)return;
    var mag=a&&a.mag;
    if(!isFinite(mag)&&a&&isFinite(a.x)&&isFinite(a.y)&&isFinite(a.z))
      mag=Math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z);
    var valid=a&&isFinite(a.diff)&&isFinite(mag);
    var quiet=!!(valid&&a.diff>=0&&a.diff<=threshold&&Math.abs(mag-1)<=threshold);
    var dt=lastMs===undefined?0:ms-lastMs;
    if(lastMs===undefined||dt<=0||dt>MAX_GAP_MS||!valid||!lastValid){
      roll(ms);quietSince=quiet?ms:undefined;
    }else{
      var start=lastMs,end,eligible=Infinity;
      if(quiet&&lastQuiet&&quietSince!==undefined)eligible=quietSince+CONFIRM_MS;
      else quietSince=quiet?ms:undefined;
      while(start<ms){
        roll(start);end=Math.min(ms,(current+1)*SLOT_MS);
        covered+=end-start;
        rest+=Math.max(0,end-Math.max(start,eligible));
        start=end;
      }
      roll(ms);
    }
    lastMs=ms;lastQuiet=quiet;lastValid=!!valid;
  }
  function sync(ms){
    // A drawing timer can fire just before the next accel event. Do not invent
    // samples for that last fraction of a second or for an LCD/app outage.
    if(Math.floor(ms/SLOT_MS)!==current){
      if(lastMs===undefined||ms-lastMs>MAX_GAP_MS){quietSince=undefined;lastQuiet=false;}
      roll(ms);lastMs=ms;
    }
  }
  function level(bucket){return stamps[bucket%COUNT]===bucket?levels[bucket%COUNT]:0;}
  function visit(ms,fn){
    var end=Math.floor(ms/SLOT_MS)-1,b;
    for(b=end-COUNT+1;b<=end;b++)if(b>=0){var value=level(b);if(value)fn(b,value);}
  }
  function snapshot(){
    var end=current-1,out="",b;
    for(b=end-COUNT+1;b<=end;b++)out+=b>=0?level(b):0;
    return {v:1,end:end,levels:out,active:{bucket:current,covered:covered,rest:rest}};
  }
  return {sample:sample,sync:sync,visit:visit,snapshot:snapshot,level:level,
    getLive:function(){return {bucket:current,covered:covered,rest:rest,
      quiet:quietSince!==undefined&&lastMs-quietSince>=CONFIRM_MS};}};
}
function install(bangle,storage,events,clock){
  clock=clock||function(){return Date.now();};
  if(bangle.orbitRest)return bangle.orbitRest;
  var engine,enabled=false,threshold,api;
  function persist(){if(engine)try{storage.writeJSON("orbit.rest.json",engine.snapshot());}catch(e){}}
  function onAccel(a){engine.sample(a,clock());}
  function configure(s){
    var on=s.restEnabled!==false,t=thresholdG(s.restThreshold);
    if(on===enabled&&(!on||t===threshold))return;
    if(enabled){bangle.removeListener("accel",onAccel);persist();}
    enabled=on;threshold=t;
    if(on){
      engine=create({thresholdG:t,nowMs:clock(),saved:storage.readJSON("orbit.rest.json",1),onCommit:persist});
      bangle.on("accel",onAccel);
    }else engine=undefined;
  }
  api={configure:configure,save:persist,isEnabled:function(){return enabled;},
    draw:function(graphics,map){draw(graphics,engine,map);},
    getEngine:function(){return engine;},sync:function(ms){if(engine)engine.sync(ms);}};
  bangle.orbitRest=api;
  if(events)events.on("kill",persist);
  configure(storage.readJSON("orbit.json",1)||{});
  return api;
}
function draw(graphics,engine,map){
  if(!engine)return;
  // Outward bars stay inside the existing Moon envelope (Moon radius >=14 px).
  var r=map.radiusPx,height=Math.max(1,Math.min(map.maxHeightPx,14));
  var dir=map.south?1:-1,now=map.nowMs;
  graphics.setColor(0x07FF);
  engine.visit(now,function(bucket,value){
    // Plot at the interval END: a completed bar expires exactly 24 h later.
    var age=now-(bucket+1)*SLOT_MS;
    var a=map.currentAngleRad-dir*age*2*Math.PI/DAY_MS;
    var ca=Math.cos(a),sa=Math.sin(a),outer=r+height*value/5;
    graphics.drawLine(Math.round(map.cx+r*ca),Math.round(map.cy+r*sa),
      Math.round(map.cx+outer*ca),Math.round(map.cy+outer*sa));
  });
}
exports.create=create;
exports.install=install;
exports.draw=draw;
exports.levelFor=levelFor;
exports.constants={slotMs:SLOT_MS,count:COUNT,confirmMs:CONFIRM_MS,maxGapMs:MAX_GAP_MS,minCoverageMs:MIN_COVERAGE_MS};
