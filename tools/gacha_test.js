// Run with node tools/gacha_test.js. No browser save or real currency is touched.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
const dataContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), dataContext);
const D = dataContext.window.DATA;
const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const fn = name => source.match(new RegExp('  function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}'))[0];
let results, random = () => 0;
const ss = D.UNITS.filter(u => u.rank === 'SS');
const save = { parts: 1000000, pity: 0, pulls: 0, tut: 1, ssTier: 2, pickup: ss[0].id };
const context = { D, G_: D.GACHA, save, Math: Object.assign(Object.create(Math), { random: () => random() }),
  featured: () => D.UNIT[save.pickup], obtain: () => ({}), persist() {},
  GAME: { toast: msg => { throw Error(msg); } }, showResult: out => { results = out; },
  TUT_PULL: ['brownie', 'valkyrie'],
};
vm.createContext(context);
const pityDefinition = source.match(/  const pityCap = [^\n]+/)[0];
vm.runInContext(pityDefinition + '\n' + fn('rollRank') + fn('pull') + fn('tutorialPull'), context);
const pull = n => vm.runInContext('pull(' + n + ')', context);
assert.equal(D.GACHA.pity, 40);
for (let i = 0; i < 39; i++) pull(1);
assert.equal(save.pity, 39); assert(results[0].u.rank !== 'SS');
pull(1); assert.equal(results[0].u.id, ss[0].id); assert.equal(save.pity, 0);
save.pity = 39; save.pickup = ss[ss.length - 1].id;
pull(1); assert.equal(results[0].u.id, save.pickup); assert.equal(save.pity, 0);
save.pity = 7; random = () => .999;
pull(1); assert.equal(results[0].u.rank, 'SS'); assert.notEqual(results[0].u.id, save.pickup); assert.equal(save.pity, 0);
let seq = [.999, 0, 0]; random = () => seq.shift() ?? 0;
pull(1); assert.equal(results[0].u.id, save.pickup); assert.equal(save.pity, 0);
save.pity = 38; random = () => 0;
pull(10); assert.equal(results[1].u.id, save.pickup); assert.equal(save.pity, 8);
const before = save.pity;
vm.runInContext('tutorialPull()', context); assert.equal(save.pity, before);
save.ssTier = 0; save.pity = 0; random = () => 0;
for (let i = 0; i < 9; i++) pull(1);
assert.equal(save.pity, 9); assert.equal(save.ssTier, 0);
pull(1); assert.equal(results[0].u.rank, 'SS'); assert.equal(save.ssTier, 1); assert.equal(save.pity, 0);
for (let i = 0; i < 19; i++) pull(1);
assert.equal(save.pity, 19);
pull(1); assert.equal(results[0].u.rank, 'SS'); assert.equal(save.ssTier, 2); assert.equal(save.pity, 0);
console.log('제조 검사 통과: 초기 10·20회 보장, 이후 40회 보장, 선택 변경, 최고 등급 획득 시 초기화, 10회 제조 경계, 튜토리얼 제외');
