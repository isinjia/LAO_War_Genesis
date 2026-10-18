// Economy simulation: a player who plays about 45 minutes (10 battles) a day, for 4 weeks.
//   node tools/econ_sim.js [days] [battlesPerDay]
// Uses the real rewards, missions, gacha rates and level costs from js/data.js. Stage requirements come from the bot
// measurements (README): normal chapter c needs an average deck level of about 2 + 6c/7 (ch1 lv2 ... ch8 lv8),
// hard chapter c about 10 + 8c/7 (H8-10: lv14 + 3 SS, or lv18). An SS in the deck is worth about 1.4 levels (max 3).
global.window = {};
require('../js/data.js');
const D = window.DATA;

const DAYS = +process.argv[2] || 28, PER_DAY = +process.argv[3] || 10;
// tuning experiments: OV='{"gacha":{"cost10":5000},"farm":0.5}' node tools/econ_sim.js
const OV = JSON.parse(process.env.OV || '{}');
Object.assign(D.GACHA, OV.gacha || {});
const SHOP_SS = OV.shopSS || D.SHOP_NEW_SS;
let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const sv = { cleared: 0, hardCleared: 0, xp: 0, parts: D.GACHA.startParts, tuna: D.GACHA.startTuna, lv: 1, ss: new Set(), owned: new Set(D.STARTERS),
  pity: 0, pulls: 0, stars: 0, ssPull: 0, ssShop: 0, partsIn: { first: 0, farm: 0, mission: 0, daily: 0 }, kills: 0, deploys: 0, skills: 0, dailies: 0, claimed: new Set() };
const SS = D.UNITS.filter((u) => u.rank === 'SS').map((u) => u.id);
const DECK = 8;
const power = () => sv.lv + 1.4 * Math.min(3, sv.ss.size);
const needN = (ix) => 2 + (6 * D.STAGES[ix].chapter) / 7;
const needH = (ix) => 10 + (8 * D.HARD[ix].chapter) / 7;

function gain(r) { sv.xp += r.xp; sv.parts += r.parts; sv.tuna += r.tuna; }
function levelUp() { // xp goes into the 8 squad members evenly
  while (sv.lv < D.MAX_LV && sv.xp >= D.lvCost(sv.lv) * DECK) { sv.xp -= D.lvCost(sv.lv) * DECK; sv.lv++; }
}
function pull() {
  sv.pulls++; sv.pity++;
  const r = rnd();
  if (sv.pity >= D.GACHA.pity || r < D.GACHA.rates.SS) { sv.pity = 0; sv.ssPull++; const id = SS[Math.floor(rnd() * SS.length)]; if (sv.ss.has(id)) sv.xp += 0; sv.ss.add(id); sv.owned.add(id); return; }
  const pool = D.UNITS.filter((u) => u.rank !== 'SS');
  sv.owned.add(pool[Math.floor(rnd() * pool.length)].id);
}
function spend() {
  while (sv.parts >= D.GACHA.cost10) { sv.parts -= D.GACHA.cost10; for (let i = 0; i < 10; i++) pull(); }
  if (sv.tuna >= SHOP_SS && sv.ss.size < SS.length) { sv.tuna -= SHOP_SS; sv.ssShop++; const id = SS.find((x) => !sv.ss.has(x)); sv.ss.add(id); sv.owned.add(id); }
}
function missions() { // one-time achievements (the parts of save they read, approximated)
  const save = { cleared: sv.cleared, hardCleared: sv.hardCleared, stars: { a: sv.stars }, owned: Object.fromEntries([...sv.owned].map((id) => [id, 1])),
    infBest: 0, pulls: sv.pulls, stats: { kills: sv.kills, deploys: sv.deploys, skills: sv.skills, dailies: sv.dailies } };
  for (const m of D.MISSIONS) {
    if (sv.claimed.has(m.id)) continue;
    const [cur, goal] = m.goal(save);
    if (cur >= goal) { sv.claimed.add(m.id); sv.tuna += m.reward.tuna; sv.parts += m.reward.parts; sv.partsIn.mission += m.reward.parts; }
  }
}

const rows = [];
let h8Day = null;
for (let day = 1; day <= DAYS; day++) {
  let wins = 0;
  for (let b = 0; b < PER_DAY; b++) {
    let st, first = false;
    if (b === 0 && sv.cleared >= D.PER_CH) { st = D.dailyStage(day, sv.cleared); sv.dailies++; first = true; }
    else if (sv.cleared < D.STAGES.length && power() >= needN(sv.cleared)) { st = D.STAGES[sv.cleared++]; first = true; sv.stars += 2.5; }
    else if (sv.cleared >= D.STAGES.length && sv.hardCleared < D.HARD.length && power() >= needH(sv.hardCleared)) { st = D.HARD[sv.hardCleared++]; first = true; }
    else st = sv.hardCleared ? D.HARD[sv.hardCleared - 1] : D.STAGES[Math.max(0, sv.cleared - 1)]; // farm the latest stage
    const r = D.reward(st, first ? 'first' : 'win');
    if (!first && OV.farm) r.parts = Math.round(r.parts * OV.farm);
    if (st.hard && OV.hardXp) r.xp = Math.round(r.xp * OV.hardXp);
    sv.partsIn[st.daily ? 'daily' : first ? 'first' : 'farm'] += r.parts;
    gain(r);
    if (st.last && !st.hard && !st.daily && first) sv.owned.add(D.CHAPTER_REWARD[st.chapter]);
    wins++; sv.kills += 40; sv.deploys += 30; sv.skills += sv.ss.size ? 3 : 0;
    levelUp(); missions(); spend();
  }
  // daily missions (all five once the daily operation is open), weekly ones on the 7th day
  const sum = (l) => l.reduce((a, m) => [a[0] + m.reward.tuna, a[1] + m.reward.parts], [0, 0]);
  if (sv.cleared >= D.PER_CH && wins >= 3) { const [t, p] = sum(D.PERIODIC.day); sv.tuna += t; sv.parts += p; sv.partsIn.periodic = (sv.partsIn.periodic || 0) + p; }
  if (day % 7 === 0) { const [t, p] = sum(D.PERIODIC.week); sv.tuna += t; sv.parts += p; sv.partsIn.periodic = (sv.partsIn.periodic || 0) + p; }
  spend();
  if (!h8Day && sv.hardCleared >= D.HARD.length) h8Day = day;
  rows.push({ day, normal: sv.cleared, hard: sv.hardCleared, lv: sv.lv, ss: sv.ss.size, pulls: sv.pulls, tuna: Math.round(sv.tuna), parts: Math.round(sv.parts) });
}
console.table(rows.filter((r) => r.day <= 7 || r.day % 7 === 0 || r.day === DAYS));
console.log('campaign cleared on day', (rows.find((r) => r.normal >= 80) || {}).day || 'never',
  '| H8-10 cleared on day', h8Day || 'never', '| SS owned at the end', sv.ss.size, `(SS results: ${sv.ssPull} from the making, ${sv.ssShop} bought)`, '| level', sv.lv);
console.log('parts earned by source', sv.partsIn);
