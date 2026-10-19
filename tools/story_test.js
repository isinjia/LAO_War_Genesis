// Structural checks for the campaign and character episodes. Run: node tools/story_test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({ window: {} });
for (const name of ['data', 'assets', 'faces', 'story']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8'), ctx);
}
const { S, NAMES, BATTLE, ART } = ctx.window.STORY;
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
    if (staging?.bgm) assert.ok(ctx.window.BGM[staging.bgm], `${key}: missing music`);
    if (staging?.sfx) assert.ok(ctx.window.SND[staging.sfx], `${key}: missing sound`);
    if (staging?.art) assert.ok(ART[staging.art] && fs.existsSync(path.join(root, ART[staging.art])), `${key}: missing story art`);
    if (staging?.motion) assert.equal(staging.motion, 'still', `${key}: unsupported acting cue`);
    if (staging?.channel) assert.equal(staging.channel, 'radio', `${key}: unsupported communication cue`);
    if (staging && Object.hasOwn(staging, 'face') && staging.face !== null)
      assert.ok(ctx.window.FACES[id]?.e[staging.face], `${key}: missing original expression ${id}/${staging.face}`);
    if (UNIT[id]) {
      assert.ok(ctx.window.FULL[id], `${key}: speaker falls back to icon ${id}`);
      assert.ok(fs.existsSync(path.join(root, 'assets', 'full', id + '.webp')), `${key}: missing portrait ${id}`);
    }
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
assert.equal(ctx.window.DATA.STAGES.at(-1).boss.e, 'Dreadlurker_BOSS_IW_N', 'last battle and story antagonist disagree');
const campaign = Object.entries(S).filter(([key]) => /^c[1-8]_/.test(key));
for (const [key, scene] of campaign) {
  assert.ok(!scene.lines.some(line => /철의 왕자|콜로서스/.test(line[1])), `${key}: old antagonist or hidden identity leaked`);
}
const ss = Object.values(UNIT).filter(unit => unit.rank === 'SS');
for (const unit of ss) assert.ok(S['ep_' + unit.id], `${unit.id}: SS episode missing`);
for (const comms of BATTLE) {
  for (const key of ['start', 'boss', 'win']) {
    assert.ok(speaker(comms[key][0]) && comms[key][1].trim(), `invalid ${key} comms`);
  }
}
console.log(`PASS: 48 campaign scenes, ${Object.keys(S).filter(k => k.startsWith('ep_')).length} episodes, ${lines} dialogue lines, 24 battle comms; speakers/backgrounds/portraits valid`);
