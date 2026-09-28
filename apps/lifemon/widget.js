(() => {
  let timer,phase=true,lcd=true;
  function flags(){
    if(global.LIFEMON&&global.LIFEMON.getIndicators)return global.LIFEMON.getIndicators();
    return [true,false,false,false,false,false,false,false,false,false,false,false];
  }
  function warn(){return !!(global.LIFEMON&&global.LIFEMON.isBatteryWarning&&global.LIFEMON.isBatteryWarning());}
  function paint(w,show){
    if(!w||w.x===undefined)return;g.reset().clearRect(w.x,w.y,w.x+w.width-1,w.y+23);if(!show)return;
    let f=flags(),xs=[4,12,20,28],ys=[4,12,20],k=0;
    for(let r=0;r<3;r++)for(let c=0;c<4;c++,k++){g.setColor(f[k]?"#0f0":"#f00");g.fillCircle(w.x+xs[c],w.y+ys[r],2);}
  }
  function stop(){if(timer)clearInterval(timer);timer=undefined;phase=true;}
  function sync(w){
    if(!warn()||!lcd){stop();paint(w,true);return;}
    if(!timer){phase=true;timer=setInterval(()=>{phase=!phase;paint(WIDGETS.lifemon,phase);},1000);}
    paint(w,phase);
  }
  WIDGETS.lifemon={area:"tr",width:33,draw:function(){sync(this);}};
  Bangle.on("lcdPower",on=>{lcd=!!on;if(!lcd)stop();else if(WIDGETS.lifemon)WIDGETS.lifemon.draw();});
})();