/* 5wCal - 5 week calendar for Bangle.js 2 */
var Storage=require("Storage");
var cfg=Storage.readJSON("fivewcal.json",1)||{};
if (!(cfg.timeout>=15 && cfg.timeout<=120)) cfg.timeout=30;

var W=g.getWidth(),H=g.getHeight();
var BLACK=0x0000,WHITE=0xFFFF,BLUE=0x001F,RED=0xF800,GREEN=0x07E0,GRAY=0x4208;
var today,homeStart,pageStart;
var autoTimer,btnTimer,tapTimer;

function midnight(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function copyDate(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function addDays(d,n){var x=copyDate(d);x.setDate(x.getDate()+n);return x;}
function mondayOf(d){var x=copyDate(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function pad2(n){return (n<10?"0":"")+n;}
function nthMonday(y,m,n){var d=new Date(y,m-1,1);return 1+((8-d.getDay())%7)+7*(n-1);}
function vernal(y){return Math.floor(20.8431+0.242194*(y-1980)-Math.floor((y-1980)/4));}
function autumn(y){return Math.floor(23.2488+0.242194*(y-1980)-Math.floor((y-1980)/4));}

function baseHoliday(d){
  var y=d.getFullYear(),m=d.getMonth()+1,n=d.getDate();
  if(m===1&&n===1)return true;
  if(m===1&&((y>=2000&&n===nthMonday(y,1,2))||(y>=1949&&y<2000&&n===15)))return true;
  if(m===2&&n===11&&y>=1967)return true;
  if(m===2&&n===23&&y>=2020)return true;
  if(m===3&&y>=1949&&n===vernal(y))return true;
  if(m===4&&n===29&&y>=1949)return true;
  if(m===5&&n===3&&y>=1949)return true;
  if(m===5&&n===4&&y>=2007)return true;
  if(m===5&&n===5&&y>=1949)return true;
  if(y===2020&&m===7&&n===23)return true;
  if(y===2021&&m===7&&n===22)return true;
  if(y!==2020&&y!==2021&&m===7&&((y>=2003&&n===nthMonday(y,7,3))||(y>=1996&&y<2003&&n===20)))return true;
  if(y===2020&&m===8&&n===10)return true;
  if(y===2021&&m===8&&n===8)return true;
  if(y!==2020&&y!==2021&&y>=2016&&m===8&&n===11)return true;
  if(m===9&&((y>=2003&&n===nthMonday(y,9,3))||(y>=1966&&y<2003&&n===15)))return true;
  if(m===9&&y>=1948&&n===autumn(y))return true;
  if(y===2020&&m===7&&n===24)return true;
  if(y===2021&&m===7&&n===23)return true;
  if(y!==2020&&y!==2021&&m===10&&((y>=2000&&n===nthMonday(y,10,2))||(y>=1966&&y<2000&&n===10)))return true;
  if(m===11&&n===3&&y>=1948)return true;
  if(m===11&&n===23&&y>=1948)return true;
  if(m===12&&n===23&&y>=1989&&y<=2018)return true;
  if(y===2019&&((m===5&&n===1)||(m===10&&n===22)))return true;
  return false;
}
function isHoliday(d){
  if(baseHoliday(d))return true;
  var y=d.getFullYear();
  if(y>=1986&&baseHoliday(addDays(d,-1))&&baseHoliday(addDays(d,1)))return true;
  if(y>=1973){
    var p=addDays(d,-1);
    if(y<2007)return d.getDay()===1&&baseHoliday(p)&&p.getDay()===0;
    while(baseHoliday(p)){if(p.getDay()===0)return true;p=addDays(p,-1);}
  }
  return false;
}

function topFreeGap(){
  var spans=[];
  if(typeof WIDGETS!=="undefined"){
    Object.keys(WIDGETS).forEach(function(k){
      var wd=WIDGETS[k];
      if(!wd||!wd.width||!wd.area||wd.area.charAt(0)!=="t")return;
      if(typeof wd.x==="number")spans.push([wd.x,wd.x+wd.width-1]);
    });
  }
  if(!spans.length&&typeof WIDGETS!=="undefined"){
    var lw=0,rw=0;
    Object.keys(WIDGETS).forEach(function(k){
      var wd=WIDGETS[k];
      if(!wd||!wd.width)return;
      if(wd.area==="tl")lw+=wd.width;
      else if(wd.area==="tr")rw+=wd.width;
    });
    if(lw)spans.push([0,lw-1]);
    if(rw)spans.push([W-rw,W-1]);
  }
  spans.sort(function(a,b){return a[0]-b[0];});
  var merged=[];
  spans.forEach(function(s){
    s[0]=Math.max(0,s[0]);s[1]=Math.min(W-1,s[1]);
    if(!merged.length||s[0]>merged[merged.length-1][1]+1)merged.push([s[0],s[1]]);
    else if(s[1]>merged[merged.length-1][1])merged[merged.length-1][1]=s[1];
  });
  var gaps=[],p=0;
  merged.forEach(function(s){if(s[0]>p)gaps.push([p,s[0]-1]);p=Math.max(p,s[1]+1);});
  if(p<W)gaps.push([p,W-1]);
  if(!gaps.length)return [0,W-1];
  gaps.sort(function(a,b){
    var aw=a[1]-a[0]+1,bw=b[1]-b[0]+1;
    if(aw!==bw)return bw-aw;
    return Math.abs(((a[0]+a[1])>>1)-(W>>1))-Math.abs(((b[0]+b[1])>>1)-(W>>1));
  });
  return gaps[0];
}
function drawTop(){
  try{Bangle.drawWidgets();}catch(e){}
  var s=pageStart.getFullYear()+"/"+pad2(pageStart.getMonth()+1);
  var gap=topFreeGap(),x1=gap[0]+2,x2=gap[1]-2;
  if(x2<x1){x1=gap[0];x2=gap[1];}
  var avail=Math.max(1,x2-x1+1),fs=14;
  g.setFont("Vector",fs);
  while(fs>8&&g.stringWidth(s)+4>avail){fs-=2;g.setFont("Vector",fs);}
  g.setBgColor(BLACK).setColor(BLACK).fillRect(x1,1,x2,22);
  g.setColor(WHITE).setFont("Vector",fs).setFontAlign(0,0).drawString(s,(x1+x2)>>1,12);
}

function line2(x1,y1,x2,y2){g.drawLine(x1,y1,x2,y2);g.drawLine(x1+1,y1,x2+1,y2);}
function weekdayGlyph(c,x,y){
  g.setColor(WHITE);
  if(c===0){line2(x-6,y-8,x-6,y+8);line2(x+5,y-8,x+5,y+8);line2(x-6,y-8,x+5,y-8);line2(x-6,y-2,x+5,y-2);line2(x-6,y+4,x+5,y+4);}
  else if(c===1){line2(x,y-8,x,y+2);line2(x-2,y-1,x-7,y-6);line2(x+2,y-1,x+7,y-6);line2(x,y+1,x-6,y+8);line2(x,y+1,x+7,y+8);}
  else if(c===2){line2(x,y-8,x,y+8);line2(x-2,y-1,x-7,y-4);line2(x-2,y-1,x-7,y+6);line2(x+2,y-2,x+7,y-5);line2(x+1,y,x+7,y+6);line2(x-1,y-7,x+2,y-4);}
  else if(c===3){line2(x,y-8,x,y+8);line2(x-7,y-2,x+7,y-2);line2(x,y-1,x-7,y+7);line2(x,y-1,x+7,y+7);}
  else if(c===4){line2(x,y-8,x-7,y-2);line2(x,y-8,x+7,y-2);line2(x-5,y-2,x+5,y-2);line2(x-6,y+3,x+6,y+3);line2(x,y-2,x,y+7);line2(x-7,y+8,x+7,y+8);line2(x-5,y+5,x-7,y+2);line2(x+5,y+5,x+7,y+2);}
  else if(c===5){line2(x,y-8,x,y+7);line2(x-5,y-4,x+5,y-4);line2(x-7,y+7,x+7,y+7);}
  else{line2(x-6,y-8,x+5,y-8);line2(x-6,y+8,x+5,y+8);line2(x-6,y-8,x-6,y+8);line2(x+5,y-8,x+5,y+8);line2(x-6,y,x+5,y);}
}
function drawWeekday(c){
  var x1=Math.floor(c*W/7),x2=Math.floor((c+1)*W/7)-1,bg=BLACK;
  if(c===5)bg=BLUE;else if(c===6)bg=RED;
  g.setColor(bg).fillRect(x1,24,x2,47);
  weekdayGlyph(c,(x1+x2)>>1,35);
}
function drawCalendar(){
  g.setBgColor(BLACK).setColor(BLACK).fillRect(0,24,W-1,H-1);
  var c,r,top=48,gh=H-48;
  for(c=0;c<7;c++)drawWeekday(c);
  for(r=0;r<5;r++){
    var y1=top+Math.floor(r*gh/5),y2=top+Math.floor((r+1)*gh/5)-1;
    for(c=0;c<7;c++){
      var d=addDays(pageStart,r*7+c),x1=Math.floor(c*W/7),x2=Math.floor((c+1)*W/7)-1;
      var bg=BLACK,fg=WHITE;
      if(c===5)bg=BLUE;
      if(c===6||isHoliday(d))bg=RED;
      if(sameDay(d,today)){bg=GREEN;fg=BLACK;}
      g.setColor(bg).fillRect(x1,y1,x2,y2);
      g.setColor(fg).setBgColor(bg).setFont("Vector",20).setFontAlign(0,0);
      g.drawString(""+d.getDate(),(x1+x2)>>1,(y1+y2)>>1);
      g.setColor(GRAY).drawRect(x1,y1,x2,y2);
    }
  }
  drawTop();
}

function clearTimer(t){if(t)clearTimeout(t);}
function armExit(){clearTimer(autoTimer);autoTimer=setTimeout(exitClock,cfg.timeout*1000);}
function exitClock(){clearTimer(autoTimer);clearTimer(btnTimer);clearTimer(tapTimer);Bangle.showClock();}
function openSystemSettings(){clearTimer(autoTimer);clearTimer(btnTimer);clearTimer(tapTimer);load("setting.app.js");}
function onTouch(){
  clearTimer(tapTimer);armExit();
  tapTimer=setTimeout(function(){tapTimer=undefined;pageStart=copyDate(homeStart);drawCalendar();},220);
}
function onSwipe(lr,ud){
  if(!ud)return;
  clearTimer(tapTimer);tapTimer=undefined;armExit();
  pageStart=addDays(pageStart,ud<0?35:-35);drawCalendar();
}
function onButton(){
  armExit();
  if(btnTimer){clearTimer(btnTimer);btnTimer=undefined;exitClock();return;}
  btnTimer=setTimeout(function(){btnTimer=undefined;openSystemSettings();},1000);
}
function installUI(){
  Bangle.setUI({mode:"custom",touch:onTouch,swipe:onSwipe,btn:onButton,remove:function(){clearTimer(autoTimer);clearTimer(btnTimer);clearTimer(tapTimer);}});
}
function showError(e){
  g.reset().setBgColor(BLACK).setColor(WHITE).clear();
  g.setFont("6x8",2).setFontAlign(0,-1).drawString("5wCal error",W>>1,20);
  g.setFont("6x8",1).setFontAlign(-1,-1);
  g.drawString(g.wrapString(""+e,W-8).join("\n"),4,50);
}
function start(){
  try{
    today=midnight(new Date());homeStart=mondayOf(today);pageStart=copyDate(homeStart);
    try{Bangle.loadWidgets();}catch(e){}
    installUI();drawCalendar();armExit();
  }catch(e){showError(e);}
}

g.reset().setBgColor(BLACK).setColor(BLACK).clear();
g.setColor(WHITE).setFont("6x8",2).setFontAlign(0,0).drawString("5wCal",W>>1,H>>1);
setTimeout(start,20);
