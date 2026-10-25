const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync('js/data.js', 'utf8'), context);
const D = context.window.DATA;
const near = (a, b, tolerance = 1.1) => assert(Math.abs(a - b) <= tolerance, `${a} / ${b}`);

assert.equal(D.UNITS.length, 40);
assert.equal(D.UNITS.filter(u => u.rank === 'SS').length, 24);
for (const u of D.UNITS) {
  assert(Number.isFinite(u.cost) && u.cost > 0 && u.cost % 10 === 0);
  assert(u.cost <= D.WORKER.cap.at(-1));
  assert(!('formationCost' in u));
  const flyHp = u.fly ? 0.5 : 1, flyAtk = u.fly ? 0.8 : 1, siegeHp = u.siege ? 1.2 : 1;
  const health = u.hp / flyHp / siegeHp * u.multi / (u.guard ? 0.6 : 1) / (1 - u.evade) / D.UNIT_BALANCE.hpPerPower;
  const attack = u.atk / flyAtk / u.rate * u.multi * u.balance.attackValue / D.UNIT_BALANCE.dpsPerPower;
  near(health + attack, D.unitBudget(u.rank, u.cost), 18);
}
for (const type of Object.keys(D.TYPES)) {
  for (const power of [100, 500, 1000, 2000, 2800]) {
    const traits = { fly: false, siege: false, guard: false, range: 4 };
    let previous = 0;
    for (const rank of D.RANK_ORDER) {
      const ground = D.unitStats(rank, power, type, {}, traits);
      const flying = D.unitStats(rank, power, type, {}, { ...traits, fly: true });
      const siege = D.unitStats(rank, power, type, {}, { ...traits, siege: true });
      const both = D.unitStats(rank, power, type, {}, { ...traits, siege: true, fly: true });
      near(flying.hp, ground.hp * 0.5); near(flying.atk, ground.atk * 0.8);
      near(siege.hp, ground.hp * 1.2); assert.equal(siege.atk, ground.atk);
      near(both.hp, ground.hp * 0.6);
      assert(ground.balance.efficiency > previous); previous = ground.balance.efficiency;
    }
  }
}
for (const rank of D.RANK_ORDER) {
  let previous = 0;
  for (const power of [100, 120, 180, 200, 280, 450, 500, 600, 1000, 2000, 2800]) {
    const efficiency = D.unitBudget(rank, power) / power;
    assert(efficiency > previous); previous = efficiency;
  }
}
for (let i = 1; i < D.RANK_ORDER.length; i++) {
  const lower = D.UNITS.filter(u => u.rank === D.RANK_ORDER[i - 1]).map(u => u.balance.efficiency);
  const higher = D.UNITS.filter(u => u.rank === D.RANK_ORDER[i]).map(u => u.balance.efficiency);
  assert(Math.min(...higher) > Math.max(...lower));
}
assert(!D.SYNERGIES.some(s => s.id === 'grunt'));
for (const rank of ['S', 'SS']) {
  const traits = { fly: false, siege: false, guard: false, range: 3 };
  const slow = D.unitStats(rank, 600, 'single', { spd: 1, evade: 0.6 }, traits);
  const fast = D.unitStats(rank, 600, 'single', { spd: 1.7, evade: 0.6 }, traits);
  assert.equal(slow.hp, fast.hp);
  if (rank === 'S') assert(fast.atk < slow.atk);
  else assert.equal(fast.atk, slow.atk);
}
console.log('전체 대원 비용, 등급 효율, 가격 효율, 비행·공성 보정, 편성 점수 제거 검사 통과');
