// Structural checks for the campaign and character episodes. Run: node tools/story_test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({ window: {} });
for (const name of ['data', 'story']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'), ctx);
}
const { S, NAMES, BATTLE } = ctx.window.STORY;
const { UNIT } = ctx.window.DATA;
const speaker = id => Object.hasOwn(UNIT, id) || Object.hasOwn(NAMES, id);
let lines = 0;
for (const [key, scene] of Object.entries(S)) {
  assert.ok(['bg_field', 'bg_city', 'bg_base'].includes(scene.bg), `${key}: missing background`);
  assert.ok(scene.lines.length > 0, `${key}: empty scene`);
  for (const [id, text, side, staging] of scene.lines) {
    assert.ok(speaker(id), `${key}: unknown speaker ${id}`);
    assert.ok(typeof text === 'string' && text.trim(), `${key}: empty dialogue`);
    assert.ok(side == null || side === '' || side === 'L' || side === 'R', `${key}: invalid portrait side`);
    if (staging?.fx) assert.ok(['shake', 'flash'].includes(staging.fx), `${key}: invalid effect`);
    if (staging?.mood) assert.ok(['ominous'].includes(staging.mood), `${key}: invalid mood`);
    if (staging?.bgm) assert.ok(['thrill'].includes(staging.bgm), `${key}: invalid music cue`);
    if (UNIT[id]) assert.ok(fs.existsSync(path.join(root, 'assets', 'full', id + '.webp')), `${key}: missing portrait ${id}`);
    lines++;
  }
  if (key.startsWith('ep_')) assert.ok(UNIT[key.slice(3)], `${key}: episode has no unit`);
}
for (let chapter = 1; chapter <= 8; chapter++) {
  for (const part of ['intro', 'event', 'elite', 'boss', 'outro', 'after']) {
    assert.ok(S[`c${chapter}_${part}`], `chapter ${chapter}: missing ${part}`);
  }
}
assert.equal(BATTLE.length, 8);
for (const comms of BATTLE) {
  for (const key of ['start', 'boss', 'win']) {
    assert.ok(speaker(comms[key][0]) && comms[key][1].trim(), `invalid ${key} comms`);
  }
}
console.log(`PASS: 48 campaign scenes, ${Object.keys(S).filter(k => k.startsWith('ep_')).length} episodes, ${lines} dialogue lines, 24 battle comms; speakers/backgrounds/portraits valid`);
