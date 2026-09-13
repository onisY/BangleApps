/* 5-Week Calendar for Bangle.js 2
 * - Black background
 * - Normal widgets at top
 * - YYYY/MM of first displayed day centered in widget bar
 * - Monday -> Sunday, 5 weeks
 * - Saturday blue / Sunday & Japanese holidays red / today green
 * - Swipe up: next 5 weeks, swipe down: previous 5 weeks
 * - Tap: return to page containing today
 * - Side button once: settings after 1 second
 * - Side button twice within 1 second: exit to clock
 * - 30 s inactivity timeout by default (configurable in settings)
 */

var Storage = require("Storage");
var SETTINGS_FILE = "fivewcal.json";
var settings = Storage.readJSON(SETTINGS_FILE,1) || {};
if (!(settings.timeout>=15 && settings.timeout<=120)) settings.timeout = 30;

var W = g.getWidth(), H = g.getHeight();
var C = {
  black: 0x0000,
  white: 0xFFFF,
  blue:  0x001F,
  red:   0xF800,
  green: 0x07E0,
  gray:  0x4208
};

var today = atMidnight(new Date());
var homeStart = mondayOf(today);
var pageStart = cloneDate(homeStart);

var autoTimer;
var buttonTimer;
var tapTimer;
var buttonWatch;
var inCalendar = false;

function atMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function cloneDate(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d,n) {
  var x = cloneDate(d);
  x.setDate(x.getDate()+n);
  return x;
}
function mondayOf(d) {
  var x = cloneDate(d);
  var dow = x.getDay();
  var back = (dow+6)%7;
  x.setDate(x.getDate()-back);
  return x;
}
function sameDate(a,b) {
  return a.getFullYear()===b.getFullYear() &&
         a.getMonth()===b.getMonth() &&
         a.getDate()===b.getDate();
}
function pad2(n) { return (n<10?"0":"")+n; }
function ymdKey(y,m,d) { return y+"-"+m+"-"+d; }
function dateKey(dt) { return ymdKey(dt.getFullYear(),dt.getMonth()+1,dt.getDate()); }

// Japanese national holidays
var holidayCache = {};

function nthMonday(y,m,n) {
  var d = new Date(y,m-1,1);
  var firstMon = 1 + ((8-d.getDay())%7);
  return firstMon + 7*(n-1);
}
function vernalDay(y) {
  if (y>=1980 && y<=2099)
    return Math.floor(20.8431 + 0.242194*(y-1980) - Math.floor((y-1980)/4));
  return 20;
}
function autumnDay(y) {
  if (y>=1980 && y<=2099)
    return Math.floor(23.2488 + 0.242194*(y-1980) - Math.floor((y-1980)/4));
  return 23;
}
function addHoliday(set,y,m,d) {
  set[ymdKey(y,m,d)] = 1;
}
function baseHolidays(y) {
  var s = {};

  addHoliday(s,y,1,1);
  if (y>=2000) addHoliday(s,y,1,nthMonday(y,1,2));
  else if (y>=1949) addHoliday(s,y,1,15);

  if (y>=1967) addHoliday(s,y,2,11);
  if (y>=2020) addHoliday(s,y,2,23);

  if (y>=1949) addHoliday(s,y,3,vernalDay(y));

  if (y>=1949) addHoliday(s,y,4,29);

  if (y>=1949) addHoliday(s,y,5,3);
  if (y>=2007) addHoliday(s,y,5,4);
  if (y>=1949) addHoliday(s,y,5,5);

  if (y===2020) addHoliday(s,y,7,23);
  else if (y===2021) addHoliday(s,y,7,22);
  else if (y>=2003) addHoliday(s,y,7,nthMonday(y,7,3));
  else if (y>=1996) addHoliday(s,y,7,20);

  if (y===2020) addHoliday(s,y,8,10);
  else if (y===2021) addHoliday(s,y,8,8);
  else if (y>=2016) addHoliday(s,y,8,11);

  if (y>=2003) addHoliday(s,y,9,nthMonday(y,9,3));
  else if (y>=1966) addHoliday(s,y,9,15);
  if (y>=1948) addHoliday(s,y,9,autumnDay(y));

  if (y===2020) addHoliday(s,y,7,24);
  else if (y===2021) addHoliday(s,y,7,23);
  else if (y>=2000) addHoliday(s,y,10,nthMonday(y,10,2));
  else if (y>=1966) addHoliday(s,y,10,10);

  if (y>=1948) addHoliday(s,y,11,3);
  if (y>=1948) addHoliday(s,y,11,23);
  if (y>=1989 && y<=2018) addHoliday(s,y,12,23);

  if (y===2019) {
    addHoliday(s,2019,5,1);
    addHoliday(s,2019,10,22);
  }
  return s;
}
function holidaysForYear(y) {
  if (holidayCache[y]) return holidayCache[y];

  var all = {};
  [y-1,y,y+1].forEach(function(yy) {
    var b = baseHolidays(yy);
    Object.keys(b).forEach(function(k){ all[k]=1; });
  });

  if (y>=1986) {
    var d = new Date(y,0,2);
    var end = new Date(y,11,30);
    while (d<=end) {
      var k = dateKey(d);
      if (!all[k]) {
        var prev = dateKey(addDays(d,-1));
        var next = dateKey(addDays(d,1));
        if (all[prev] && all[next]) all[k]=1;
      }
      d = addDays(d,1);
    }
  }

  if (y>=1973) {
    var base = baseHolidays(y);
    Object.keys(base).forEach(function(k) {
      var p = k.split("-");
      var dt = new Date(+p[0],+p[1]-1,+p[2]);
      if (dt.getDay()===0) {
        var sub = addDays(dt,1);
        if (y>=2007) {
          while (all[dateKey(sub)]) sub = addDays(sub,1);
        }
        all[dateKey(sub)] = 1;
      }
    });
  }

  var only = {};
  Object.keys(all).forEach(function(k) {
    if (k.indexOf(y+"-")===0) only[k]=1;
  });
  holidayCache[y] = only;
  return only;
}
function isHoliday(d) {
  return !!holidaysForYear(d.getFullYear())[dateKey(d)];
}

function drawTopBar() {
  Bangle.drawWidgets();
  var title = pageStart.getFullYear()+"/"+pad2(pageStart.getMonth()+1);
  g.setBgColor(C.black).setColor(C.white).setFont("Vector",14).setFontAlign(0,0);
  var tw = g.stringWidth(title)+4;
  var x1 = Math.max(0,Math.floor((W-tw)/2));
  var x2 = Math.min(W-1,Math.floor((W+tw)/2));
  g.clearRect(x1,2,x2,21);
  g.drawString(title,W/2,12);
}

function thickLine(x1,y1,x2,y2) {
  g.drawLine(x1,y1,x2,y2);
  g.drawLine(x1+1,y1,x2+1,y2);
}
function drawWeekKanji(c,cx,cy) {
  var x=cx, y=cy;
  g.setColor(C.white);
  if (c===0) {
    thickLine(x-6,y-8,x-6,y+8); thickLine(x+5,y-8,x+5,y+8);
    thickLine(x-6,y-8,x+5,y-8); thickLine(x-6,y-2,x+5,y-2);
    thickLine(x-6,y+4,x+5,y+4);
  } else if (c===1) {
    thickLine(x,y-8,x,y+2);
    thickLine(x-2,y-1,x-7,y-6); thickLine(x+2,y-1,x+7,y-6);
    thickLine(x,y+1,x-6,y+8); thickLine(x,y+1,x+7,y+8);
  } else if (c===2) {
    thickLine(x,y-8,x,y+8);
    thickLine(x-2,y-1,x-7,y-4); thickLine(x-2,y-1,x-7,y+6);
    thickLine(x+2,y-2,x+7,y-5); thickLine(x+1,y,x+7,y+6);
    thickLine(x-1,y-7,x+2,y-4);
  } else if (c===3) {
    thickLine(x,y-8,x,y+8); thickLine(x-7,y-2,x+7,y-2);
    thickLine(x,y-1,x-7,y+7); thickLine(x,y-1,x+7,y+7);
  } else if (c===4) {
    thickLine(x,y-8,x-7,y-2); thickLine(x,y-8,x+7,y-2);
    thickLine(x-5,y-2,x+5,y-2); thickLine(x-6,y+3,x+6,y+3);
    thickLine(x,y-2,x,y+7);
    thickLine(x-7,y+8,x+7,y+8);
    thickLine(x-5,y+5,x-7,y+2); thickLine(x+5,y+5,x+7,y+2);
  } else if (c===5) {
    thickLine(x,y-8,x,y+7);
    thickLine(x-5,y-4,x+5,y-4); thickLine(x-7,y+7,x+7,y+7);
  } else {
    thickLine(x-6,y-8,x+5,y-8); thickLine(x-6,y+8,x+5,y+8);
    thickLine(x-6,y-8,x-6,y+8); thickLine(x+5,y-8,x+5,y+8);
    thickLine(x-6,y,x+5,y);
  }
}
function drawDowCell(c) {
  var x1 = Math.floor(c*W/7);
  var x2 = Math.floor((c+1)*W/7)-1;
  var y1 = 24, y2 = 47;
  var bg = C.black;
  if (c===5) bg = C.blue;
  if (c===6) bg = C.red;
  g.setColor(bg).fillRect(x1,y1,x2,y2);
  drawWeekKanji(c,Math.floor((x1+x2)/2),Math.floor((y1+y2)/2));
}

function drawCalendar() {
  g.setBgColor(C.black).setColor(C.black).fillRect(0,24,W-1,H-1);

  for (var c=0;c<7;c++) drawDowCell(c);

  var gridTop = 48;
  var gridH = H-gridTop;
  for (var r=0;r<5;r++) {
    var y1 = gridTop + Math.floor(r*gridH/5);
    var y2 = gridTop + Math.floor((r+1)*gridH/5)-1;
    for (var c2=0;c2<7;c2++) {
      var idx = r*7+c2;
      var d = addDays(pageStart,idx);
      var x1 = Math.floor(c2*W/7);
      var x2 = Math.floor((c2+1)*W/7)-1;
      var bg = C.black, fg = C.white;

      if (c2===5) bg = C.blue;
      if (c2===6 || isHoliday(d)) bg = C.red;
      if (sameDate(d,today)) { bg = C.green; fg = C.black; }

      g.setColor(bg).fillRect(x1,y1,x2,y2);
      g.setColor(fg).setBgColor(bg).setFont("Vector",20).setFontAlign(0,0);
      g.drawString(""+d.getDate(),Math.floor((x1+x2)/2),Math.floor((y1+y2)/2));
      g.setColor(C.gray).drawRect(x1,y1,x2,y2);
    }
  }
  drawTopBar();
}

function clearAutoTimer() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer=undefined; }
}
function armAutoTimer() {
  clearAutoTimer();
  autoTimer = setTimeout(exitToClock, settings.timeout*1000);
}
function clearTapTimer() {
  if (tapTimer) { clearTimeout(tapTimer); tapTimer=undefined; }
}
function clearButtonTimer() {
  if (buttonTimer) { clearTimeout(buttonTimer); buttonTimer=undefined; }
}
function exitToClock() {
  cleanupCalendarUI();
  Bangle.showClock();
}

function onTouch() {
  if (!inCalendar) return;
  clearTapTimer();
  armAutoTimer();
  tapTimer = setTimeout(function() {
    tapTimer=undefined;
    pageStart = cloneDate(homeStart);
    drawCalendar();
  },220);
}

function onSwipe(lr,ud) {
  if (!inCalendar || !ud) return;
  clearTapTimer();
  armAutoTimer();
  pageStart = addDays(pageStart, ud<0 ? 35 : -35);
  drawCalendar();
}

function onButton() {
  if (!inCalendar) return;
  armAutoTimer();
  if (buttonTimer) {
    clearButtonTimer();
    exitToClock();
    return;
  }
  buttonTimer = setTimeout(function() {
    buttonTimer=undefined;
    showSettings();
  },1000);
}

function installCalendarUI() {
  cleanupCalendarUI();
  inCalendar = true;
  Bangle.on("touch",onTouch);
  Bangle.on("swipe",onSwipe);
  buttonWatch = setWatch(onButton,BTN,{repeat:true,edge:"rising",debounce:50});
  armAutoTimer();
}

function cleanupCalendarUI() {
  inCalendar = false;
  clearAutoTimer();
  clearTapTimer();
  clearButtonTimer();
  Bangle.removeListener("touch",onTouch);
  Bangle.removeListener("swipe",onSwipe);
  if (buttonWatch!==undefined) {
    clearWatch(buttonWatch);
    buttonWatch=undefined;
  }
}

function saveSettings() {
  Storage.writeJSON(SETTINGS_FILE,settings);
}
function returnFromSettings() {
  E.showMenu();
  today = atMidnight(new Date());
  homeStart = mondayOf(today);
  drawCalendar();
  installCalendarUI();
}
function showSettings() {
  cleanupCalendarUI();
  E.showMenu({
    "": {title:"5wCal"},
    "< Back": returnFromSettings,
    "Auto exit": {
      value: settings.timeout,
      min: 15, max: 120, step: 15,
      format: function(v){ return v+" s"; },
      onchange: function(v){ settings.timeout=v; saveSettings(); }
    },
    "Today": function(){
      pageStart=cloneDate(homeStart);
      returnFromSettings();
    },
    "Clock": exitToClock
  });
}

Bangle.loadWidgets();
g.setBgColor(C.black).setColor(C.white).clear();
Bangle.drawWidgets();
drawCalendar();
installCalendarUI();
