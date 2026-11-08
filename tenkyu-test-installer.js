/* Pinned experimental tenkyu updater.
 * Never remove the installed app or its data files before uploading an update:
 * Comms.removeApp also erases orbit.json, orbit.rest.json and calendar/event data.
 * Uploading the same filenames replaces code and app info, preserving user data.
 */
(function(){
  "use strict";
  var COMMIT="a389754be48014f4a2b739516ee239148578252a";
  var ROOT="https://raw.githubusercontent.com/onisY/BangleApps/"+COMMIT+"/apps/orbit/";
  var button=document.getElementById("installtenkyutest");
  if(!button)return;
  button.addEventListener("click",function(){
    if(typeof startOperation!=="function"||typeof Comms==="undefined"||
       typeof getInstalledApps!=="function"){
      alert("App Loader is not ready. Please reload.");return;
    }
    startOperation({name:"Install tenkyu v0.106 TEST (keep settings)"},function(){
      return (async function(){
        var response=await fetch(ROOT+"metadata.json",{cache:"no-store"});
        if(!response.ok)throw Error("metadata HTTP "+response.status);
        var meta=await response.json();
        if(meta.id!=="orbit"||meta.version!=="0.106")
          throw Error("Unexpected test version");
        var entries=(meta.storage||[]).filter(function(x){return !!x.url;});
        if(entries.length<10||!entries.some(function(x){return x.name==="orbit.rest";})||
           !entries.some(function(x){return x.name==="orbit.north";}))
          throw Error("Incomplete tenkyu metadata");

        // Content supplied directly from a single pinned commit, so the loader
        // does not accidentally load source files from the master branch.
        await Promise.all(entries.map(async function(entry){
          if(!/^[a-zA-Z0-9_.-]+$/.test(entry.url))throw Error("Unsafe filename");
          var r=await fetch(ROOT+entry.url,{cache:"no-store"});
          if(!r.ok)throw Error(entry.url+": HTTP "+r.status);
          var bytes=new Uint8Array(await r.arrayBuffer()),text="";
          for(var i=0;i<bytes.length;i++)text+=String.fromCharCode(bytes[i]);
          entry.content=text;
        }));
        // Explicitly no removal, erasure or data-entry payloads.
        // app.data lists the persistent files but provides no content to write.
        if(!(await showPrompt("Update tenkyu",
          "Install v0.106 TEST? Existing clock settings, rest history, calendar and event data will be kept.")))
          return;
        await getInstalledApps();
        var info=await Comms.uploadApp(meta,{device:device,language:LANGUAGE});
        device.appsInstalled=device.appsInstalled.filter(function(a){return a.id!==meta.id;});
        if(info)device.appsInstalled.push(info);
        if(typeof refreshMyApps==="function")refreshMyApps();
        if(typeof refreshLibrary==="function")refreshLibrary();
        if(typeof showToast==="function")showToast("tenkyu v0.106 TEST installed; settings kept","success");
      })().catch(function(e){
        console.error("tenkyu test install:",e);
        if(typeof showToast==="function")showToast("tenkyu test: "+e.message,"error");
        else alert("tenkyu test: "+e.message);
        throw e;
      });
    });
  });
})();
