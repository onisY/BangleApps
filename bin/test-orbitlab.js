/* Run: node bin/test-orbitlab.js [captured-raw.csv] */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const dir = path.join(__dirname, '../apps/orbitlab');
const candidate = require(path.join(dir, 'candidate.js'));
function synthetic(mode) {
  const e = candidate.create();
  for (let ms = 0; ms < 65000; ms += 80) {
    e.sample({x: mode === 'motion' ? Math.sin(ms / 1000) : 0, y: 0, z: 1}, ms);
    if (mode !== 'nohr' && ms % 1040 === 0)
      e.hrm({bpm: 70, confidence: mode === 'pulse' ? 100 : 0}, ms);
  }
  return e;
}
assert.equal(synthetic('nohr').result(65000).state, 'off_candidate');
assert.equal(synthetic('pulse').result(65000).state, 'still_pulse');
assert.equal(synthetic('off').result(65000).state, 'off_candidate');
assert.equal(synthetic('motion').result(65000).state, 'motion');
assert.equal(candidate.create().result(65000).state, 'insufficient');
assert.equal(synthetic('off').result(130000).state, 'insufficient');
const charged = synthetic('off');
charged.setCharging(true);
assert.equal(charged.result(65000).state, 'charging');
charged.setCharging(false);
assert.equal(charged.result(65000).state, 'insufficient');

// Execute the actual recorder and actual current engine with a simulated device.
const files = {}, listeners = {}, requests = {}, timers = new Map();
let now = 1794931500000, menu, timerId = 0;
const storage = {
  read: name => fs.readFileSync(path.join(dir, name === 'orbitlab.rest' ? 'rest.js' : 'candidate.js'), 'utf8'),
  readJSON: () => undefined,
  writeJSON: () => {},
  getFree: () => 1000000,
  open: name => ({write: text => { files[name] = (files[name] || '') + text; return true; }})
};
const clock = class extends Date { static now() { return now; } };
const sandbox = {
  require: () => storage, Date: clock, console,
  Bangle: {
    on: (name, fn) => { listeners[name] = fn; },
    removeListener: name => { delete listeners[name]; },
    isCharging: () => false, isHRMOn: () => Object.values(requests).some(Boolean),
    setHRMPower: (value, id) => { requests[id] = value; return true; }
  },
  E: {showMenu: m => { menu = m; }, showAlert: () => ({then: () => {}}),
    getBattery: () => 80, on: () => {}, removeListener: () => {}},
  setInterval: fn => { timers.set(++timerId, fn); return timerId; },
  clearInterval: id => timers.delete(id), setTimeout: () => ++timerId, clearTimeout: () => {}, load: () => {}
};
vm.runInNewContext(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'), sandbox);
menu['Start recording']();
for (let i = 0; i < 813; i++) {
  now = 1794931500000 + i * 80;
  listeners.accel({x: 0, y: 0, z: 1});
  if (i % 13 === 0) listeners.HRM({bpm: 70, confidence: 0});
  if (i % 50 === 0) for (const fn of timers.values()) fn();
}
menu['< Stop']();
const saved = suffix => files[Object.keys(files).find(k => k.endsWith(suffix))];
const out = saved('-out.csv').trim().split('\n').at(-1).split(',');
assert.equal(out[3], 'partial_unconfirmed');
assert.equal(+out[1], now);
assert.equal(+out[11], 1);
assert.equal(saved('-cmp.csv').trim().split('\n').at(-1).split(',')[2], 'off_candidate');
assert.equal(saved('-cmp.csv').trim().split('\n').at(-1).split(',').at(-1), '1');
assert(!Object.values(requests).some(Boolean), 'all lab HRM requests released');
assert.equal(Object.keys(listeners).length, 0);
assert.equal(timers.size, 0);

// A graph-compatible replay uses the same candidate module and saved timestamps.
function replay(text) {
  const rows = text.trim().split('\n').slice(1).map(r => r.split(','));
  const profile = rows.find(r => r[1] === 'profile');
  const e = candidate.create(profile ? JSON.parse(decodeURIComponent(profile[2])) : {});
  const ordered = rows.filter(r => ['accel', 'hrm', 'charging'].includes(r[1])).sort((a,b) => +a[0]-b[0]);
  let next = Math.ceil(+ordered[0][0] / 10000) * 10000;
  const results = [];
  for (const r of ordered) {
    const ms = +r[0];
    while (next <= ms) { results.push(e.result(next)); next += 10000; }
    if (r[1] === 'accel') e.sample({x: +r[2], y: +r[3], z: +r[4]}, ms);
    if (r[1] === 'hrm') e.hrm({bpm: +r[5], confidence: +r[6]}, ms);
    if (r[1] === 'charging') e.setCharging(+r[2]);
  }
  return {results, final: e.result(+ordered.at(-1)[0])};
}
assert.equal(replay(saved('-raw.csv')).final.state, 'off_candidate');
if (process.argv[2]) {
  const {results} = replay(fs.readFileSync(process.argv[2], 'utf8'));
  const count = rows => rows.reduce((o,r) => { o[r.state] = (o[r.state] || 0) + 1; return o; }, {});
  console.log(JSON.stringify({before0101:count(results.filter(r => r.time < Date.parse('2026-11-17T16:01:00Z'))),
    after0102:count(results.filter(r => r.time >= Date.parse('2026-11-17T16:02:00Z'))),
    firstCandidate:results.find(r => r.state === 'off_candidate')}, null, 2));
}
console.log('Rest Lab synthetic, recorder cleanup, partial logging and replay checks passed.');

// Execute the graph script against a small DOM/canvas adapter, using both CSV formats.
async function checkGraph(rawText, outText) {
  const cell = () => ({append: () => {}});
  const row = () => ({append: () => {}, insertCell: cell});
  const elements = {};
  for (const id of ['raw','out','plot','status','details','noise','drift'])
    elements[id] = {addEventListener: () => {}, replaceChildren: () => {}, value: 0,
      createTHead: () => ({insertRow: row}), createTBody: () => ({insertRow: row})};
  elements.raw.files = [{name:'test-raw.csv', text:async () => rawText}];
  elements.out.files = [{name:'test-out.csv', text:async () => outText}];
  elements.plot.getContext = () => ({fillRect: () => {}, fillText: () => {}});
  const context = {document:{getElementById:id => elements[id],createElement:cell},RestLabCandidate:candidate};
  vm.createContext(context);
  const html = fs.readFileSync(path.join(dir,'graph.html'),'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script,context);
  await context.redraw();
  assert.equal(elements.plot.hidden,false,elements.status.textContent);
  assert(elements.status.textContent.includes('判定枠'));
}
(async () => {
  await checkGraph(saved('-raw.csv'),saved('-out.csv'));
  if(process.argv[2])
    await checkGraph(fs.readFileSync(process.argv[2],'utf8'),
      fs.readFileSync(process.argv[2].replace('-raw.csv','-out.csv'),'utf8'));
  console.log('Old/new CSV graph rendering checks passed.');
})().catch(e => {console.error(e);process.exitCode=1;});
