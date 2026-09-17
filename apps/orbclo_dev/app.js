/* Orbclo Dev - development harness; public Orbclo remains clean */
(function(){
  var Storage=require("Storage");
  var src=Storage.read("orbclo_dev.core.js");
  if(!src){E.showMessage("orbclo_dev.core.js missing","Orbclo Dev");return;}

  function patch(oldText,newText,label){
    if(src.indexOf(oldText)<0){
      E.showMessage("Patch mismatch: "+label,"Orbclo Dev");
      throw new Error("Orbclo Dev patch mismatch: "+label);
    }
    src=src.replace(oldText,newText);
  }

  patch('var CFG="orbclo.json", SHOTSTATE="orbcloshot.json", SHOTMAX=20;',
        'var CFG="orbclo_dev.json", SHOTSTATE="orbclo_devshot.json", SHOTMAX=20;',"storage");
  src=src.replace(/"orbclo"/g,'"orbclodev"');
  patch('return "oc"+(i<10?"0":"")+i+".bmp";',
        'return "od"+(i<10?"0":"")+i+".bmp";',"screenshots");

  patch('var killed=false, widgetsLoaded=false;',
        'var killed=false, widgetsLoaded=false,inputBusy=false,inputReleaseTimer;',"input state");

  patch('function clearTimer(t){if(t)clearTimeout(t);}',
        'function clearTimer(t){if(t)clearTimeout(t);}\n'+
        '  function blockInput(){inputBusy=true;clearTimer(inputReleaseTimer);inputReleaseTimer=undefined;stopTap();}\n'+
        '  function releaseInputSoon(){if(!inputBusy)return;clearTimer(inputReleaseTimer);inputReleaseTimer=setTimeout(function(){inputReleaseTimer=undefined;inputBusy=false;},250);}',
        "input lock helpers");

  patch('function openCalendar(){\n    transition();',
        'function openCalendar(){\n    blockInput();transition();',"open calendar lock");

  patch('function calendarToOrbit(){\n    transition();',
        'function calendarToOrbit(){\n    blockInput();transition();',"calendar return lock");

  patch('function showSettings(){\n    transition();stopVisualTimers();hideWidgets();mode="settings";',
        'function showSettings(){\n    blockInput();transition();stopVisualTimers();hideWidgets();mode="settings";',"settings lock");

  patch('startCalBlink();armCalIdle();\n  }',
        'startCalBlink();armCalIdle();releaseInputSoon();\n  }',"calendar release");

  patch('armMinute();armScene();\n  }',
        'armMinute();armScene();releaseInputSoon();\n  }',"orbit release");

  patch('E.showMenu(menu);\n  }',
        'E.showMenu(menu);releaseInputSoon();\n  }',"settings release");

  patch('if(mode==="calendar")selectDate(p);',
        'if(mode==="calendar"){blockInput();selectDate(p);releaseInputSoon();}',"calendar double tap lock");

  patch('if(killed||!Bangle.isLCDOn())return;\n    if(mode==="orbit"){if(Bangle.isLocked&&Bangle.isLocked())return;orbitTap();}',
        'if(killed||inputBusy||!Bangle.isLCDOn())return;\n    if(mode==="orbit"){orbitTap();}',"touch lock handling");

  patch('function onSwipe(lr,ud){\n    if(mode==="calendar"&&ud)',
        'function onSwipe(lr,ud){\n    if(inputBusy)return;\n    if(mode==="calendar"&&ud)',"swipe lock handling");

  patch('function exitApp(){if(killed)return;transition();cleanup();Bangle.showLauncher();}',
        'function exitApp(){if(killed||inputBusy)return;blockInput();transition();cleanup();Bangle.showLauncher();}',"button lock handling");

  patch('if(killed)return;killed=true;stopVisualTimers();clearTimer(eventTimer);eventTimer=undefined;stopGPS();',
        'if(killed)return;killed=true;stopVisualTimers();clearTimer(inputReleaseTimer);inputReleaseTimer=undefined;clearTimer(eventTimer);eventTimer=undefined;stopGPS();',"cleanup input timer");

  src=src.replace(/Orbclo/g,"Orbclo Dev");
  eval(src);
})();
