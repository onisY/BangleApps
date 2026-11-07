/* Explicit, pinned experimental tenkyu installer. Does not alter the normal
 * app catalogue. Fetches all files from one reviewed Git commit.
 * Uses the loader's existing processFiles() installation path.
 */
(function(){
  "use strict";
  var COMMIT="d035a3fc38bb94ac2c447dc6f3591429786d7388";
  var ROOT="https://raw.githubusercontent.com/onisY/BangleApps/"+COMMIT+"/apps/orbit/";
  var button=document.getElementById("installtenkyutest");
  if(!button)return;
  button.addEventListener("click",function(){
    if(typeof startOperation!=="function"||typeof processFiles!=="function"){
      alert("App Loader is not ready. Please reload.");return;
    }
    startOperation({name:"Install tenkyu 96px test"},function(){
      return (async function(){
        var response=await fetch(ROOT+"metadata.json",{cache:"no-store"});
        if(!response.ok)throw Error("metadata HTTP "+response.status);
        var meta=await response.json();
        if(meta.id!=="orbit"||meta.version!=="0.105")throw Error("Unexpected test metadata");
        var entries=(meta.storage||[]).concat(meta.data||[]).filter(function(x){return !!x.url;});
        if(entries.length<10||!entries.some(function(x){return x.name==="orbit.north";}))throw Error("Incomplete tenkyu metadata");
        var files=await Promise.all(entries.map(async function(entry){
          if(!/^[a-zA-Z0-9_.-]+$/.test(entry.url))throw Error("Unsafe filename");
          var r=await fetch(ROOT+entry.url,{cache:"no-store"});
          if(!r.ok)throw Error(entry.url+": HTTP "+r.status);
          return {name:entry.url,data:await r.arrayBuffer()};
        }));
        files.unshift({name:"metadata.json",data:new TextEncoder().encode(JSON.stringify(meta)).buffer});
        // processFiles displays its own confirmation prompt and uses standard
        // app removal/upload, including the existing app's data-file behavior.
        await new Promise(function(resolve){processFiles(files,resolve);});
      })().catch(function(e){
        console.error("tenkyu test install:",e);
        if(typeof showToast==="function")showToast("tenkyu test: "+e.message,"error");
        else alert("tenkyu test: "+e.message);
      });
    });
  });
})();
