/* Orbclo Dev Orbit 0.03 - minimal input/header diagnostic */
(function(){
  var W=g.getWidth(),H=g.getHeight();
  var BLACK=0x0000,WHITE=0xFFFF,NAVY=0x000F,CYAN=0x07FF,YELLOW=0xFFE0,RED=0xF800;
  var busy=false,killed=false,touchCount=0,transitionTimer,minuteTimer,unlockTimer;

  function clear(t){if(t)clearTimeout(t);}
  function pad(n){return n<10?"0"+n:""+n;}

  function drawHeader(){
    var d=new Date(),bat=E.getBattery();
    var left=pad(d.getMonth()+1)+"/"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes());
    var right=bat+"%";
    g.setColor(WHITE).fillRect(0,0,W-1,23);
    g.setFont("Vector",12).setBgColor(WHITE);
    g.setFontAlign(-1,0).setColor(BLACK).drawString(left,3,11);
    g.setFontAlign(1,0).setColor(bat<=20?RED:BLACK).drawString(right,W-3,11);
  }

  function drawBase(){
    g.reset().setBgColor(BLACK).setColor(BLACK).clear();
    g.setColor(YELLOW).fillCircle(W-28,52,7);
    g.setColor(CYAN).fillCircle(54,116,30);
    g.setColor(BLACK).fillCircle(46,116,24);
    g.setColor(WHITE).drawCircle(54,116,30);
    g.setColor(WHITE).setBgColor(BLACK).setFont("Vector",14).setFontAlign(0,0).drawString("Orbit input test",W>>1,H-22);
    drawHeader();
    try{g.flip();}catch(e){}
    busy=false;
  }

  function showTouch(){
    touchCount++;
    busy=true;
    g.reset().setBgColor(NAVY).setColor(NAVY).clear();
    g.setColor(WHITE).setBgColor(NAVY).setFont("Vector",24).setFontAlign(0,0).drawString("TOUCH "+touchCount,W>>1,H>>1);
    try{g.flip();}catch(e){}
    clear(transitionTimer);
    transitionTimer=setTimeout(function(){transitionTimer=undefined;if(!killed)drawBase();},400);
  }

  function onTouch(){
    if(killed||busy)return;
    showTouch();
  }

  function onLock(isLocked){
    if(!isLocked||killed)return;
    clear(unlockTimer);
    unlockTimer=setTimeout(function(){unlockTimer=undefined;if(!killed)try{Bangle.setLocked(false);}catch(e){}},0);
  }

  function armMinute(){
    clear(minuteTimer);
    minuteTimer=setTimeout(function(){minuteTimer=undefined;if(!killed){drawHeader();try{g.flip();}catch(e){}armMinute();}},60000-(Date.now()%60000)+25);
  }

  function cleanup(){
    if(killed)return;
    killed=true;
    clear(transitionTimer);clear(minuteTimer);clear(unlockTimer);
    try{Bangle.removeListener("lock",onLock);}catch(e){}
  }

  try{Bangle.setUI({mode:"custom",touch:onTouch,btn:function(){if(!busy)Bangle.showLauncher();},remove:cleanup});}catch(e){}
  Bangle.on("lock",onLock);
  try{Bangle.setLocked(false);}catch(e){}
  drawBase();
  armMinute();
})();
