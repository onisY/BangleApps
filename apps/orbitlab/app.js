(function () {
  var Storage = require("Storage");
  var PROFILE = "orbit.restcfg.json";
  var LAB_ID = "orbitlab";
  var engine = {};
  (new Function("exports", Storage.read("orbitlab.rest")))(engine);
  var continuous = true, minutes = 30, session;
  var config = Storage.readJSON("orbit.json",1) || {};

  function menu() {
    E.showMenu({
      "": {title:"Rest Lab"},
      "< Back": function () { load(); },
      "HRM continuous": {value:continuous,onchange:function (v) { continuous=v; }},
      "Minutes": {value:minutes,min:10,max:120,step:5,onchange:function (v) { minutes=v; }},
      "Save test profile": function () {
        if (Storage.readJSON(PROFILE,1)) {
          E.showAlert("Profile already exists", "Rest Lab").then(menu);
          return;
        }
        Storage.writeJSON(PROFILE,engine.restProfile(config));
        E.showAlert(PROFILE,"Profile saved").then(menu);
      },
      "Start recording": start
    });
  }

  function start() {
    if (Storage.getFree()<131072) { E.showAlert("Low storage","Rest Lab").then(menu); return; }
    var t=Date.now(), prefix="orbitlab-"+t.toString(36);
    var raw=Storage.open(prefix+"-raw.csv","w");
    var decisions=Storage.open(prefix+"-out.csv","w");
    var buffered="", out="", lastBucket=-1, lastRow="", failed=false;
    var settings=engine.restProfile(config,Storage.readJSON(PROFILE,1));
    session={end:t+minutes*60000};
    var active=session, listeners={}, service;
    function guardWrite(file,data) {
      if (!data || failed) return;
      try {
        if (file.write(data)===false) throw new Error("write failed");
      } catch(e) { failed=true; }
    }
    function flush() {
      guardWrite(raw,buffered); buffered="";
      guardWrite(decisions,out); out="";
    }
    function sample(kind,a,b,c,d,e) {
      buffered+=[Date.now(),kind,a,b,c,d,e].join(",")+"\n";
      if (buffered.length>=900) flush();
    }
    function receive(name,data) {
      var handle=listeners[name];
      if (handle) handle(data);
    }
    function onAccel(a) {
      if (a && isFinite(a.x)&&isFinite(a.y)&&isFinite(a.z))
        sample("accel",a.x,a.y,a.z);
      receive("accel",a);
    }
    function onHRM(h) {
      if (h && isFinite(h.bpm)&&isFinite(h.confidence))
        sample("hrm","","","",h.bpm,h.confidence);
      receive("HRM",h);
    }
    function onCharge(v) { sample("charging",v?1:0); receive("charging",v); }
    function writeResult(snapshot) {
      var list=snapshot.diag;
      var d=list[list.length-1];
      if (!d || d.bucket<lastBucket) return;
      var row=[d.bucket*300000,(d.bucket+1)*300000,d.result,d.reason,d.coverageSec,
        d.driftG,d.activity,d.activity300,d.peaks,d.pulse,d.confidence].join(",")+"\n";
      if (row!==lastRow) {
        out+=row; lastRow=row; lastBucket=d.bucket;
      }
    }
    var device={
      on:function (name,fn) { listeners[name]=fn; },
      removeListener:function (name,fn) { if (listeners[name]===fn) delete listeners[name]; },
      isHRMOn:function () { return Bangle.isHRMOn(); },
      setHRMPower:function (on) { return Bangle.setHRMPower(on,LAB_ID+"probe"); },
      isCharging:function () { return Bangle.isCharging(); }
    };
    var storage={
      readJSON:function (name) { if(name==="orbit.json")return settings; },
      writeJSON:function (name,snapshot) { if(name==="orbit.rest.json")writeResult(snapshot); }
    };
    function stop(message, showMenu) {
      if (session!==active) return;
      session=undefined;
      clearInterval(active.timer);
      Bangle.removeListener("accel",onAccel);
      Bangle.removeListener("HRM",onHRM);
      Bangle.removeListener("charging",onCharge);
      E.removeListener("kill",onKill);
      if (service) {
        service.sync(Date.now());
        service.configure({restEnabled:false});
      }
      if (continuous) {
        try { Bangle.setHRMPower(0,LAB_ID); } catch(e) {}
      }
      flush();
      if (showMenu) E.showAlert(failed?"Write failed":message,"Rest Lab").then(menu);
    }
    function onKill() { stop("",false); }
    function tick() {
      service.sync(Date.now());
      flush();
      if (failed || Storage.getFree()<131072 || Date.now()>=active.end)
        stop(Date.now()>=active.end?"Recording saved":"Low storage",true);
    }
    guardWrite(raw,"time_ms,type,x_g,y_g,z_g,bpm,confidence\n");
    guardWrite(decisions,"start_ms,end_ms,result,reason,coverage_s,drift_g,raw_sum_g,peak_sum_g,peaks,pulse,confidence\n");
    if (failed || Storage.getFree()<131072) { stop("Low storage",true); return; }
    // The engine uses the same reducer and probe scheduler as tenkyu.
    // Keep its history and sensor power request separate from tenkyu's.
    service=engine.install(device,storage,{on:function () {},getBattery:function () { return E.getBattery(); }});
    Bangle.on("accel",onAccel);
    Bangle.on("HRM",onHRM);
    Bangle.on("charging",onCharge);
    E.on("kill",onKill);
    if (continuous) {
      try {
        if (!Bangle.setHRMPower(1,LAB_ID)) throw new Error("HRM unavailable");
      } catch(e) { stop("HRM unavailable",true); return; }
    }
    sample("charging",Bangle.isCharging()?1:0);
    // Include the frozen settings and HRM mode in the raw capture.
    buffered+=t+",profile,"+encodeURIComponent(JSON.stringify(settings))+","+(continuous?"continuous":"tenkyu")+"\n";
    active.timer=setInterval(tick,4000);
    E.showMenu({"":{title:"Recording"},"< Stop":function () { stop("Recording saved",true); }});
  }
  menu();
}());
