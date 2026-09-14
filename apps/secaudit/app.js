/* Bangle Security Audit - static security inspection for Bangle.js 2 */
var S=require("Storage");
var report;
var MAX_READ=32768;
var MAX_FINDINGS=100;

function yn(v){return v?"YES":"NO";}
function safeRead(n){
  try {
    var s=S.read(n,0,MAX_READ);
    return (typeof s==="string")?s:"";
  } catch(e) { return ""; }
}
function crc(n){
  var s=safeRead(n);
  if(!s)return "-";
  try {
    if(E.CRC32)return (E.CRC32(s)>>>0).toString(16);
  } catch(e){}
  var h=0;
  for(var i=0;i<s.length;i++) h=((h<<5)-h+s.charCodeAt(i))|0;
  return (h>>>0).toString(16);
}
function sampleAround(src,idx,len){
  var a=Math.max(0,idx-36),b=Math.min(src.length,idx+(len||1)+64);
  return src.substring(a,b).replace(/[\r\n\t]+/g," ").replace(/ +/g," ").substring(0,130);
}
function pushFinding(a,sev,file,kind,detail,sample){
  if(a.length>=MAX_FINDINGS)return;
  a.push({sev:sev,file:file,kind:kind,detail:detail,sample:sample||""});
}
function ownerMap(){
  var m={};
  S.list(/\.info$/).forEach(function(fn){
    var j=S.readJSON(fn,1);
    if(!j)return;
    var owner=j.name||fn.replace(/\.info$/,'');
    var fs=(j.files||"").split(",");
    fs.forEach(function(f){if(f)m[f]=owner;});
    if(j.src)m[j.src]=owner;
  });
  return m;
}
function currentSettings(){return S.readJSON("setting.json",1)||{};}
function scan(){
  var st=currentSettings();
  var files=S.list();
  var owners=ownerMap();
  var apps=[],boots=[],findings=[];

  S.list(/\.info$/).forEach(function(fn){
    var j=S.readJSON(fn,1);
    if(j)apps.push({id:fn.replace(/\.info$/,''),name:j.name||fn,version:j.version||"?",type:j.type||"app"});
  });
  apps.sort(function(a,b){var A=a.name||"",B=b.name||"";return A<B?-1:A>B?1:0;});

  files.forEach(function(fn){
    if(fn===".boot0"||fn===".bootcde"||fn==="bootupdate.js"||/\.boot\.js$/.test(fn))boots.push({file:fn,crc:crc(fn),owner:owners[fn]||""});
  });
  boots.sort(function(a,b){return a.file<b.file?-1:a.file>b.file?1:0;});

  var exec=files.filter(function(fn){return fn!=="secaudit.app.js"&&(/\.js$/.test(fn)||fn===".boot0"||fn===".bootcde");});
  /* Keep each API as a separate regexp. Some Espruino builds can behave
     unexpectedly with complex/non-capturing regexp alternatives. */
  var pats=[
    ["HIGH",/NRF\.setAdvertising\s*\(/,"BLE advertising TX"],
    ["HIGH",/NRF\.connect\s*\(/,"Outbound BLE connection"],
    ["HIGH",/NRF\.requestDevice\s*\(/,"Outbound BLE connection"],
    ["HIGH",/\.gatt\.connect\s*\(/,"GATT outbound connection"],
    ["HIGH",/Bluetooth\.write\s*\(/,"BLE UART data TX"],
    ["HIGH",/Bluetooth\.print\s*\(/,"BLE UART data TX"],
    ["HIGH",/Bluetooth\.println\s*\(/,"BLE UART data TX"],
    ["HIGH",/NRF\.wake\s*\(/,"Can re-enable BLE"],
    ["HIGH",/Bluetooth\.setConsole\s*\(/,"Bluetooth console control"],
    ["HIGH",/Flash\.write\s*\(/,"Raw flash write"],
    ["MED",/NRF\.setServices\s*\(/,"Custom BLE services"],
    ["MED",/NRF\.setScan\s*\(/,"BLE scanning"],
    ["MED",/NRF\.findDevices\s*\(/,"BLE scanning"],
    ["MED",/NRF\.setTxPower\s*\(/,"BLE TX power control"],
    ["MED",/NRF\.sendHIDReport\s*\(/,"BLE HID transmit"],
    ["MED",/Storage\.list\s*\(/,"Storage enumeration"],
    ["MED",/require\(["']Storage["']\)\.list\s*\(/,"Storage enumeration"],
    ["INFO",/Bangle\.setGPSPower\s*\(/,"GPS access"],
    ["INFO",/Bangle\.on\s*\(\s*["']GPS["']/,"GPS access"],
    ["INFO",/Bangle\.setHRMPower\s*\(/,"Heart-rate access"],
    ["INFO",/Bangle\.on\s*\(\s*["']HRM["']/,"Heart-rate access"],
    ["INFO",/Bangle\.on\s*\(\s*["']accel["']/,"Accelerometer access"]
  ];
  exec.forEach(function(fn){
    var src=safeRead(fn);
    if(!src)return;
    var seen={};
    pats.forEach(function(p){
      if(seen[p[2]])return;
      var m=src.match(p[1]);
      if(m){
        seen[p[2]]=1;
        pushFinding(findings,p[0],fn,p[2],owners[fn]||"",sampleAround(src,m.index,m[0].length));
      }
    });
  });

  var programmable=(st.blerepl!==false);
  var whitelist=!!(st.whitelist&&st.whitelist.length&&!st.whitelist_disabled);
  var passkey=!!(st.passkey&&(""+st.passkey).length===6);
  var privacy=!!(st.bleprivacy&&st.blename===false);
  var high=0,med=0,info=0;
  findings.forEach(function(f){if(f.sev==="HIGH")high++;else if(f.sev==="MED")med++;else info++;});
  var cfgRisk=0;
  if(st.ble!==false)cfgRisk++;
  if(programmable)cfgRisk+=2;
  if(!whitelist)cfgRisk++;
  if(!passkey)cfgRisk++;

  report={
    generated:(new Date()).toISOString(),
    hw:process.env.HWVERSION,
    board:process.env.BOARD||"?",
    firmware:process.env.VERSION||"?",
    git:process.env.GIT_COMMIT||"",
    bluetooth:{
      ble:(st.ble!==false), programmable:programmable, hid:!!st.HID,
      passkey:passkey, whitelist:whitelist,
      whitelistCount:(st.whitelist&&st.whitelist.length)||0,
      privacyHideName:privacy
    },
    boot:boots,
    apps:apps,
    findings:findings,
    counts:{apps:apps.length,boot:boots.length,high:high,medium:med,info:info,configRisk:cfgRisk},
    limits:{maxRead:MAX_READ,maxFindings:MAX_FINDINGS},
    note:"Static audit only. Firmware authenticity and hidden hardware cannot be proven on-device. Pretokenized code may reduce pattern detection. API use is capability, not proof of malicious intent."
  };
  try{S.writeJSON("secaudit.json",report);}catch(e){}
  return report;
}
function backMain(){showMain();}
function alertText(title,text,back){E.showAlert(text,title).then(back||backMain);}
function summary(){
  var r=report,c=r.counts;
  var s="FW: "+r.firmware+"\nGit: "+(r.git||"?")+"\nHW: "+r.hw+"\nApps: "+c.apps+"\nBoot code: "+c.boot+"\nHigh-capability: "+c.high+"\nMedium: "+c.medium+"\nInfo: "+c.info+"\n\nFW authenticity:\nNOT VERIFIED";
  alertText("Audit Summary",s);
}
function bluetooth(){
  var b=report.bluetooth;
  var s="BLE: "+yn(b.ble)+"\nProgrammable: "+yn(b.programmable)+"\nPasskey: "+yn(b.passkey)+"\nWhitelist: "+yn(b.whitelist)+" ("+b.whitelistCount+")\nHide name: "+yn(b.privacyHideName)+"\nHID: "+yn(b.hid);
  if(b.programmable)s+="\n\nWARN: Programmable is ON";
  if(b.ble&&!b.whitelist)s+="\nWARN: No active whitelist";
  if(b.ble&&!b.passkey)s+="\nWARN: No 6-digit passkey";
  alertText("Bluetooth",s);
}
function showBoot(){
  var m={"":{title:"Boot code"},"< Back":showMain};
  if(!report.boot.length)m["None found"]=function(){};
  report.boot.forEach(function(b,i){
    var k=(i+1)+" "+b.file;
    m[k]=function(){alertText("Boot file",b.file+"\nOwner: "+(b.owner||"unknown")+"\nCRC: "+b.crc,showBoot);};
  });
  E.showMenu(m);
}
function showApps(){
  var m={"":{title:"Installed apps"},"< Back":showMain};
  report.apps.forEach(function(a,i){
    var k=(i+1)+" "+(a.name||a.id);
    if(k.length>24)k=k.substr(0,24);
    m[k]=function(){alertText("App",a.name+"\nID: "+a.id+"\nVersion: "+a.version+"\nType: "+a.type,showApps);};
  });
  E.showMenu(m);
}
function sevMark(s){return s==="HIGH"?"!":s==="MED"?"?":"i";}
function showFindings(){
  var m={"":{title:"Code findings"},"< Back":showMain};
  if(!report.findings.length)m["No matches"]=function(){};
  report.findings.forEach(function(f,i){
    var k=sevMark(f.sev)+(i+1)+" "+f.file;
    if(k.length>24)k=k.substr(0,24);
    m[k]=function(){
      var s=f.kind+"\n\nFile:\n"+f.file+"\n\nOwner:\n"+(f.detail||"unknown");
      if(f.sample)s+="\n\nMatch:\n"+f.sample;
      s+="\n\nAPI presence is not proof of malicious behavior.";
      alertText(f.sev+" capability",s,showFindings);
    };
  });
  E.showMenu(m);
}
function disableProgrammable(){
  E.showPrompt("Turn Programmable OFF?\n\nYou can turn it back on in Settings when using App Loader/IDE.",{title:"Security Audit"}).then(function(ok){
    if(!ok)return showHardening();
    var st=currentSettings();
    st.blerepl=false;
    S.writeJSON("setting.json",st);
    alertText("Saved","Programmable is now set OFF.\n\nRestart the watch for boot-time Bluetooth console settings to be rebuilt.",showHardening);
  });
}
function hideName(){
  E.showPrompt("Hide the BLE device name?\n\nThis improves privacy but can make manual discovery harder.",{title:"Security Audit"}).then(function(ok){
    if(!ok)return showHardening();
    var st=currentSettings();
    st.bleprivacy=1;
    st.blename=false;
    S.writeJSON("setting.json",st);
    alertText("Saved","Privacy is set to Hide name.\n\nRestart the watch for all boot-time BLE settings to be rebuilt.",showHardening);
  });
}
function hardeningGuide(){
  alertText("Recommended","1. Programmable OFF\n2. Set a 6-digit Passkey\n3. Whitelist your trusted phone/PC\n4. Optionally Hide name\n5. Restart\n6. Run Security Audit again",showHardening);
}
function openSettings(){load("setting.app.js");}
function showHardening(){
  var b=report.bluetooth;
  var m={"":{title:"BLE Hardening"},"< Back":showMain};
  m["Programmable: "+(b.programmable?"ON":"OFF")]=disableProgrammable;
  m["Hide name: "+(b.privacyHideName?"YES":"NO")]=hideName;
  m["Passkey: "+(b.passkey?"SET":"NONE")]=openSettings;
  m["Whitelist: "+(b.whitelist?"ON":"OFF")]=openSettings;
  m["Open Settings"]=openSettings;
  m["Recommended steps"]=hardeningGuide;
  E.showMenu(m);
}
function limitations(){
  alertText("What this cannot prove","This app cannot prove that installed firmware matches an official build, cannot inspect the MCU bootloader binary, and cannot rule out undocumented hardware.\n\nIt performs settings checks and static scans of readable Storage code only. Pretokenized/minified apps can reduce pattern detection.");
}
function rescan(){
  E.showMessage("Scanning...","Security Audit");
  setTimeout(function(){report=scan();showMain();},20);
}
function showMain(){
  var c=report.counts;
  var m={
    "":{title:"Security Audit"},
    "< Exit":function(){load();},
    "Summary":summary,
    "Bluetooth":bluetooth,
    "BLE Hardening":showHardening
  };
  m["Boot code ("+c.boot+")"]=showBoot;
  m["Apps ("+c.apps+")"]=showApps;
  m["Findings !"+c.high+" ?"+c.medium]=showFindings;
  m["Limitations"]=limitations;
  m["Rescan"]=rescan;
  E.showMenu(m);
}

E.showMessage("Scanning Storage...","Security Audit");
setTimeout(function(){try{report=scan();showMain();}catch(e){E.showAlert("Audit failed:\n"+e,"Security Audit").then(function(){load();});}},20);
