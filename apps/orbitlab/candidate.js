/* Experimental, causal 60-second classifier shared by watch and CSV replay. */
(function (api) {
  function defaults(p) {
    p=p||{};
    function number(k,d,lo,hi) { var v=p[k]; return typeof v==="number"&&isFinite(v)&&v>=lo&&v<=hi?v:d; }
    return {windowSeconds:60,minSeconds:54,minSamples:5,
      noiseG:number("labNoiseG",0.04,0.001,1),driftG:number("labDriftG",0.05,0.001,1),
      confidence:number("restPulseConfidence",90,0,100),
      hrMinSeconds:30,absentRatio:number("labAbsentRatio",0.2,0,1),
      presentRatio:number("labPresentRatio",0.6,0,1)};
  }
  function create(profile) {
    var cfg=defaults(profile),history=[],current,charge=false;
    if(cfg.presentRatio<cfg.absentRatio)cfg.presentRatio=cfg.absentRatio;
    function fresh(sec) { return {sec:sec,n:0,x:0,y:0,z:0,q:0,first:0,last:0,hr:false,good:false}; }
    function advance(ms) {
      var sec=Math.floor(ms/1000);
      if (!current) current=fresh(sec);
      if (sec<current.sec) return false;
      if (sec!==current.sec) { history.push(current);current=fresh(sec); }
      while (history.length && history[0].sec<sec-cfg.windowSeconds) history.shift();
      return true;
    }
    function sample(a,ms) {
      if (!a||!isFinite(a.x)||!isFinite(a.y)||!isFinite(a.z)||!advance(ms)) return;
      if (!current.n) current.first=ms;
      current.last=ms;current.n++;current.x+=a.x;current.y+=a.y;current.z+=a.z;
      current.q+=a.x*a.x+a.y*a.y+a.z*a.z;
    }
    function hrm(h,ms) {
      if (!h||!isFinite(h.bpm)||!isFinite(h.confidence)||!advance(ms)) return;
      current.hr=true;
      // One vote per observed second, never carry an old BPM through missing data.
      current.good=h.bpm>0&&h.confidence>cfg.confidence;
    }
    function result(ms) {
      advance(ms);
      var valid=history.filter(function (s) { return s.n>=cfg.minSamples&&s.last-s.first>=500; });
      var noise=[],x=0,y=0,z=0,q=0,hr=0,good=0;
      history.forEach(function (s) { if(s.hr){hr++;if(s.good)good++;} });
      valid.forEach(function (s) {
        var a=s.x/s.n,b=s.y/s.n,c=s.z/s.n;
        x+=a;y+=b;z+=c;q+=a*a+b*b+c*c;
        noise.push(Math.sqrt(Math.max(0,s.q/s.n-a*a-b*b-c*c)));
      });
      var n=valid.length,drift=n?Math.sqrt(Math.max(0,q/n-(x*x+y*y+z*z)/(n*n))):0;
      noise.sort(function(a,b){return a-b;});
      var rms=n?noise[Math.floor(n/2)]:0,ratio=hr?good/hr:-1,state="insufficient";
      if(charge)state="charging";
      else if(n>=cfg.minSeconds) {
        if(rms>cfg.noiseG||drift>cfg.driftG)state="motion";
        else if(hr<cfg.hrMinSeconds)state="hr_missing";
        else if(ratio<=cfg.absentRatio)state="off_candidate";
        else if(ratio>=cfg.presentRatio)state="still_pulse";
        else state="hr_uncertain";
      }
      return {time:ms,start:(Math.floor(ms/1000)-cfg.windowSeconds)*1000,state:state,
        seconds:n,noiseG:rms,driftG:drift,hrSeconds:hr,goodSeconds:good,ratio:ratio};
    }
    return {sample:sample,hrm:hrm,result:result,setCharging:function(v){if(charge!==!!v){history=[];current=undefined;}charge=!!v;},config:cfg};
  }
  api.defaults=defaults;api.create=create;
}(typeof exports!=="undefined"?exports:(globalThis.RestLabCandidate={})));
