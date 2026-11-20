// Browser replay of recordings made before the case-temperature classifier.
// Fixed-size 60-second sensor window: under 2 KiB of typed-array storage.
// Acceleration-only non-wear is a heuristic for exceptionally quiet placement.
function wearTracker(profile,memory) {
  profile=profile||{};
  function option(k,d,lo,hi) { var v=profile[k];return typeof v==="number"&&isFinite(v)?Math.max(lo,Math.min(hi,v)):d; }
  var cfg={noiseG:option("restWearNoiseG",0.030,0.001,1),
    driftG:option("restWearDriftG",0.025,0.001,1),
    quietNoiseG:option("restQuietNoiseG",0.012,0.001,1),
    quietDriftG:option("restQuietDriftG",0.012,0.001,1),
    confidence:option("restPulseConfidence",90,1,100),
    absentRatio:option("restAbsentRatio",0.10,0,0.5),
    minHRSeconds:20,minSeconds:54,windowSeconds:60,
    hold:profile.restWearHold!==false,sleepGuard:profile.restSleepGuard!==false,
    sleepStart:option("restSleepStart",22,0,23),sleepEnd:option("restSleepEnd",8,0,23)};
  var stamps=new Uint32Array(60),data=new Float32Array(240),hrStamps=new Uint32Array(60),
    hrGood=new Uint8Array(60),sec=-1,n=0,sx=0,sy=0,sz=0,sq=0,first=0,last=0,
    charging=false,powerError=false,held="",cached,at=-1;
  var lastConfirmed=memory&&isFinite(memory.lastConfirmed)?Math.max(0,memory.lastConfirmed):0;
  function sleepTime(ms){
    var offset=isFinite(profile.restSleepUtcOffset)?profile.restSleepUtcOffset:profile.tzBase;
    var hour=isFinite(offset)?new Date(ms+offset*60000).getUTCHours():new Date(ms).getHours();
    return cfg.sleepGuard&&(cfg.sleepStart===cfg.sleepEnd||
      (cfg.sleepStart<cfg.sleepEnd?hour>=cfg.sleepStart&&hour<cfg.sleepEnd:hour>=cfg.sleepStart||hour<cfg.sleepEnd));
  }
  function reset() {
    stamps.fill(0);hrStamps.fill(0);sec=-1;n=0;held="";cached=undefined;at=-1;
  }
  function advance(ms) {
    var next=Math.floor(ms/1000);
    if(next<sec){reset();lastConfirmed=0;}
    if(next!==sec) {
      if(sec>=0&&n>=3&&last-first>=500) {
        var i=sec%60,k=i*4,x=sx/n,y=sy/n,z=sz/n;
        stamps[i]=sec+1;data[k]=x;data[k+1]=y;data[k+2]=z;
        data[k+3]=Math.sqrt(Math.max(0,sq/n-x*x-y*y-z*z));
      }
      sec=next;n=0;sx=0;sy=0;sz=0;sq=0;
    }
  }
  function sample(a,ms) {
    if(!a||!isFinite(a.x)||!isFinite(a.y)||!isFinite(a.z)||!isFinite(ms))return;
    advance(ms);
    if(!n)first=ms;
    last=ms;n++;sx+=a.x;sy+=a.y;sz+=a.z;sq+=a.x*a.x+a.y*a.y+a.z*a.z;
  }
  function hrm(h,ms) {
    if(!h||!isFinite(h.bpm)||!isFinite(h.confidence)||!isFinite(ms))return;
    advance(ms);
    var i=sec%60;hrStamps[i]=sec+1;
    hrGood[i]=h.bpm>0&&h.confidence>cfg.confidence?1:0;
  }
  function result(ms) {
    // Diagnostics may ask for the last sample after a newer timer read.
    // A read must never rewind sensor state or erase confirmed wear.
    if(sec>=0&&ms<sec*1000)ms=sec*1000;
    advance(ms);
    var now=Math.floor(ms/10000);
    if(cached&&now===at)return cached;
    at=now;
    var noise=[],x=0,y=0,z=0,q=0,hr=0,good=0;
    for(var i=0;i<60;i++) {
      if(stamps[i]>sec-60&&stamps[i]<=sec&&stamps[i]) {
        var k=i*4,a=data[k],b=data[k+1],c=data[k+2];
        x+=a;y+=b;z+=c;q+=a*a+b*b+c*c;noise.push(data[k+3]);
      }
      if(hrStamps[i]>sec-60&&hrStamps[i]<=sec&&hrStamps[i]) {hr++;good+=hrGood[i];}
    }
    var count=noise.length;
    noise.sort(function(a,b){return a-b;});
    var rms=count?noise[Math.floor(count/2)]:0;
    var drift=count?Math.sqrt(Math.max(0,q/count-(x*x+y*y+z*z)/(count*count))):0;
    var ratio=hr?good/hr:-1,state="insufficient",reason="accel_missing";
    var still=count>=cfg.minSeconds&&rms<=cfg.noiseG&&drift<=cfg.driftG;
    var quiet=still&&rms<=cfg.quietNoiseG&&drift<=cfg.quietDriftG;
    var pulseConfirmed=good>=10&&ratio>=0.6;
    if(pulseConfirmed&&!charging)lastConfirmed=ms;
    var recentWear=lastConfirmed>0&&ms>=lastConfirmed&&ms-lastConfirmed<=86400000;
    var protect=sleepTime(ms)&&(held!=="off"||recentWear);
    if(charging){state="charging";reason="charging";held="";}
    else if(count<cfg.minSeconds){held="";}
    else if(!still){state="motion";reason="window_motion";held="";}
    else if(powerError){state="hr_error";reason="hrm_power_error";held="";}
    else if(pulseConfirmed){state="still_pulse";reason="sustained_pulse";held="worn";}
    else if(cfg.hold&&held==="worn"){state="still_pulse";reason="pulse_held_still";}
    else if(protect){state=recentWear?"wear_held":"wear_uncertain";reason=recentWear?"sleep_wear_history":"sleep_nonwear_deferred";}
    else if(quiet&&good<=2){state="off_candidate";reason=hr?"nonwear_quiet":"nonwear_quiet_no_hr";held="off";}
    else if(hr>=cfg.minHRSeconds&&ratio<=cfg.absentRatio){state="off_candidate";reason="nonwear_low_pulse_ratio";held="off";}
    else if(cfg.hold&&held==="off"){state="off_candidate";reason="nonwear_held_window";}
    else {state=hr<cfg.minHRSeconds?"hr_missing":"hr_uncertain";reason=state;}
    cached={time:ms,start:(sec-60)*1000,state:state,reason:reason,seconds:count,
      noiseG:rms,driftG:drift,hrSeconds:hr,goodSeconds:good,ratio:ratio,
      stationary:still,quiet:quiet,sleepProtected:protect,confirmedWear:recentWear};
    return cached;
  }
  return {sample:sample,hrm:hrm,result:result,config:cfg,
    memory:function(){return {lastConfirmed:lastConfirmed};},
    setCharging:function(v){if(charging!==!!v)reset();charging=!!v;if(charging)lastConfirmed=0;},
    setError:function(v){powerError=!!v;cached=undefined;}};
}

(function(api){api.create=wearTracker;api.defaults=function(p){return wearTracker(p).config;};}(typeof exports!=="undefined"?exports:(globalThis.RestLabCandidate={})));
