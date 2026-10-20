// Balance report: ?unlock=1&balance=1 plays headless battles (GAME.sim) with a scripted commander and scores the game
// out of 100 in four areas. Open the console (or window.BAL) for the numbers behind each score.
//   level      — the squad the economy gives you by each stage (STAGES xp, one replay each) clears it, and a squad two
//                levels lower has a clearly harder time (levels matter)
//   difficulty — the lowest squad level that clears each sampled stage climbs with the campaign, elites / bosses sit
//                above their neighbours, nothing is out of reach or trivial, hard mode asks for more
//   units      — every unit's cost efficiency (damage dealt + damage held off, per money spent, adjusted for rank) is
//                within reach of its peers in a standard battle
//   roles      — every role the squad screen promises has units at more than one rank, wins its own situation clearly
//                and is still usable in an ordinary battle
// The commander (bot) upgrades income, keeps two tanks in front, saves for its dearest ready unit and fires the Orca
// cannon on groups and bosses. It is a fixed, average player: scores compare the game against itself, not a human.
(function () {
  const D = window.DATA, U = D.UNIT;
  const SAMPLE = [0, 2, 4, 6, 9]; // stages sampled per chapter (x-1, x-3, x-5 elite, x-7, x-10 boss)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const has = (id, r) => U[id].roles.includes(r);

  // ── the economy's squad: battle level and units by stage ──
  const cum = (L) => { let s = 0; for (let l = 1; l < L; l++) s += D.lvCost(l); return s; };
  function expectedLevel(g) { // XP of first clears + one replay at half, shared by 8 cards
    let xp = 0;
    for (let i = 0; i < g; i++) xp += D.STAGES[i].xp * 1.5;
    let L = 1;
    while (L < 15 && 8 * cum(L + 1) <= xp) L++;
    return L;
  }
  // starters, chapter rewards so far and what the opening 10-pull and later making typically bring
  function expectedDeck(c) {
    const ids = ['brownie', 'leprechaun', 'gnome', 'banshee', 'amy'].concat(D.STAGE_REWARD.slice(0, c));
    if (c >= 1) ids.push('daphne');
    if (c >= 3) ids.push('andvari');
    if (c >= 4) ids.push('labiata'); // the first SS (the making's pity reaches it around here)
    const out = [];
    let cost = 0;
    for (const id of ids) { const k = D.DECK_COST[U[id].rank]; if (out.length < 10 && cost + k <= D.DECK_CAP && !out.includes(id)) { out.push(id); cost += k; } }
    return out;
  }

  // ── the commander ──
  function bot(G, deck) {
    if (G.worker < 3 && G.money >= D.WORKER.cost[G.worker]) GAME.upgradeWorker();
    const live = G.allies.filter((a) => !a.dead);
    const tanks = live.filter((a) => a.def.roles.includes('tank') && !a.def.tower).length;
    const towers = live.filter((a) => a.def.tower).length;
    const ready = deck.map((d, i) => ({ i, u: U[d.id] })).filter((s) => G.cds[s.i] <= 0 && !GAME.onField(s.u) && !(s.u.tower && towers >= 2));
    const isTank = (u) => u.roles.includes('tank') || u.multi > 1;
    ready.sort((a, b) => (tanks < 2 ? isTank(b.u) - isTank(a.u) : 0) || b.u.cost - a.u.cost);
    const wallet = GAME.wallet();
    for (const s of ready) {
      if (G.money >= s.u.cost) GAME.deploy(s.i);
      else if (s.u.cost <= wallet && G.money < wallet * 0.95) break; // save up for it
    }
    if (G.cannon >= D.CANNON.charge) {
      const near = G.enemies.filter((e) => !e.dead && e.x < D.CANNON.reach + 1).length;
      const b = G.boss && !G.boss.dead && G.boss.x < D.CANNON.reach + 1;
      if (near >= 3 || b || (b && G.boss.ai && G.boss.ai.move && G.boss.ai.move.i === 0)) GAME.fireCannon();
    }
  }

  // a breath between battle chunks (a message, not a timer: hidden tabs throttle timers) so the page stays answerable
  const breathe = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  async function battle(st, deck, opt = {}) {
    await GAME.preload(st, deck.map((d) => U[d.id]), () => {});
    GAME.start(st, deck.map((d) => ({ def: U[d.id], lv: d.lv })), {});
    const G = GAME.state;
    if (opt.setup) opt.setup(G);
    const T = opt.T || 600;
    let n = 0;
    while (!G.over && G.t < T) { (opt.bot || bot)(G, deck); GAME.sim(0.25); if (++n % 80 === 0) await breathe(); }
    const r = { win: G.over === 'win', over: G.over || 'time', t: G.t, base: G.base.hp / G.base.max, ebase: G.ebase.hp / G.ebase.max, stat: G.stat };
    GAME.stop();
    return r;
  }
  const squad = (ids, lv) => ids.map((id) => ({ id, lv }));
  // margin of a run: a win scores 1 + base HP left (and speed), a loss what share of the fortress fell
  const margin = (r) => (r.win ? 1 + 0.6 * r.base + 0.4 * clamp(1 - r.t / 600, 0, 1) : 1 - r.ebase);

  // ── 1. level balance ──
  async function level(log) {
    const rows = [];
    for (let c = 0; c < 8; c++) for (const s of SAMPLE) {
      const st = D.STAGES[c * 10 + s], L = expectedLevel(st.ix), ids = expectedDeck(c);
      const a = await battle(st, squad(ids, L)), b = await battle(st, squad(ids, Math.max(1, L - 2)));
      // (below battle level 3 there is no squad two levels lower: the opening stages are not asked to feel it)
      // levels matter: two levels down loses, keeps clearly less of its base, or clears clearly slower
      const ok = a.win && a.base >= 0.3, felt = L < 3 || !b.win || a.base - b.base >= 0.15 || b.t >= a.t * 1.2;
      rows.push({ code: st.code, L, win: a.win, base: +a.base.toFixed(2), t: Math.round(a.t), low: b.win ? +b.base.toFixed(2) : 'lose', lowT: Math.round(b.t), ok, felt });
      if (log) log(`level ${st.code} L${L} ${ok ? 'ok' : 'FAIL'} ${felt ? '' : '(levels barely matter)'}`);
    }
    const pass = rows.filter((r) => r.ok).length / rows.length, felt = rows.filter((r) => r.felt).length / rows.length;
    return { score: Math.round(100 * (0.7 * pass + 0.3 * felt)), pass, felt, rows };
  }

  // ── 2. difficulty curve ──
  async function needLevel(st, ids, from = 1) { // the lowest battle level that clears it (16: none up to 15)
    for (let L = from; L <= 15; L++) { const r = await battle(st, squad(ids, L)); if (r.win && r.base >= 0.2) return L; }
    return 16;
  }
  async function difficulty(log) {
    const rows = [];
    for (let c = 0; c < 8; c++) for (const s of SAMPLE) {
      const st = D.STAGES[c * 10 + s], E = expectedLevel(st.ix), ids = expectedDeck(c);
      const R = await needLevel(st, ids, Math.max(1, E - 6));
      rows.push({ code: st.code, g: st.ix, E, R, kind: st.last ? 'boss' : st.elite ? 'elite' : '' });
      if (log) log(`need ${st.code}: L${R} (expected L${E})`);
    }
    // in reach (R <= E) and not trivial (R >= E - 4)
    const reach = rows.filter((r) => r.R <= r.E && r.R >= r.E - 4).length / rows.length;
    // climbs with the campaign: rank correlation between stage order and the level it asks for
    const rank = (a) => { const s = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = []; s.forEach(([, i], k) => { r[i] = k; }); return r; };
    const rg = rank(rows.map((r) => r.g)), rr = rank(rows.map((r) => r.R + r.g * 1e-4)), n = rows.length;
    const rho = 1 - (6 * rg.reduce((a, v, i) => a + (v - rr[i]) ** 2, 0)) / (n * (n * n - 1));
    // a boss / elite asks for at least what the stage before it asked
    const spikes = rows.filter((r) => r.kind).map((r) => { const p = rows[rows.indexOf(r) - 1]; return !p || p.code[0] !== r.code[0] || r.R >= p.R; });
    const spike = spikes.filter(Boolean).length / spikes.length;
    // no wall: consecutive samples never jump by more than 3 levels
    const jumps = rows.slice(1).filter((r, i) => r.R - rows[i].R <= 3).length / (rows.length - 1);
    // hard mode asks for more than normal on its first and last chapter's bosses
    const hard = [];
    for (const g of [9, 79]) {
      const h = D.HARD[g], ids = expectedDeck(Math.floor(g / 10)), n0 = rows.find((r) => r.g === g).R; // the same squad as normal
      const Rh = await needLevel(h, ids, Math.min(15, n0));
      hard.push(Rh >= Math.min(15, n0 + 2));
      if (log) log(`hard ${h.code}: L${Rh} (normal L${n0})`);
    }
    const hardOk = hard.filter(Boolean).length / hard.length;
    const score = Math.round(100 * (0.35 * reach + 0.25 * clamp(rho, 0, 1) + 0.15 * spike + 0.15 * jumps + 0.1 * hardOk));
    return { score, reach, rho: +rho.toFixed(2), spike, jumps, hardOk, rows };
  }

  // ── 3 / 4. units and roles ──
  // a spotlight battle: the tested unit is the squad's main pick next to a fixed cheap core; its stats are read back
  // the core: two cheap gunners (no tank, so a tested tank is the one in front)
  const CORE = ['leprechaun', 'banshee'];
  async function spotlight(st, id, L, runs, setup, solo) {
    const v = { dealt: 0, fort: 0, taken: 0, spent: 0 };
    for (let k = 0; k < runs; k++) {
      const ids = solo ? [id] : [id].concat(CORE.filter((x) => x !== id)); // solo: the role's own situation, no helpers
      const r = await battle(st, squad(ids, L), {
        T: 150,
        // a measuring window: the tested unit can be afforded at once and neither base falls inside it
        setup: (G) => { G.money = 1500; G.base.hp = G.base.max *= 20; G.ebase.hp = G.ebase.max *= 4; if (setup) setup(G); },
        bot: (G, deck) => { // the tested unit first whenever it is ready; the core only on a full wallet
          if (G.worker < 2 && G.money >= D.WORKER.cost[G.worker]) GAME.upgradeWorker();
          const towers = G.allies.filter((a) => !a.dead && a.def.tower).length;
          if (G.cds[0] <= 0 && !(U[id].tower && towers >= 2)) { if (G.money >= U[id].cost) GAME.deploy(0); else return; }
          if (G.money > GAME.wallet() * 0.8) for (let i = 1; i < deck.length; i++) GAME.deploy(i);
        },
      });
      for (const k2 in v) v[k2] += r.stat[k2][id] || 0;
    }
    return v;
  }
  // rank adjusts what a unit is expected to return per money (a rank's stat gain over its cost gain)
  const RANK_K = { B: 1, A: 1.125, S: 1.33, SS: 1.375 };
  // the measuring situations keep the campaign's base strength curve (before DIFF), so unit scores don't move when
  // the campaign is retuned
  const basePow = (g) => Math.round((1 + 3.0 * Math.pow(g / 79, 0.75)) * 100) / 100;
  const custom = (base, spawns, extra) => Object.assign({}, base, { spawns, rush: { at: 0.5, spawns: [] }, boss: null, elite: false, last: false, finale: false,
    pow: basePow(base.ix), baseHp: Math.round((1200 + base.ix * 220) / 100) * 100 }, extra);
  function scenarios() {
    const S = D.STAGES;
    return {
      general: { st: Object.assign({}, S[33], { pow: basePow(33), baseHp: 8500, boss: null }), metric: (v) => v.dealt + 0.6 * v.taken + 0.5 * v.fort },
      siege: { st: custom(S[41], [['Rampart_N', 2, 12, 0, 1], ['Centurion_N', 4, 10, 0, 1], ['Phalangites_N', 8, 18, 0, 1]], { baseHp: 30000 }), metric: (v) => v.fort },
      ship: { st: custom(S[63], [['Centurion_N', 2, 8, 0, 1], ['Phalangites_N', 6, 14, 0, 1], ['Destroyer_N', 20, 40, 0, 1]]), metric: (v) => v.dealt + v.taken },
      tower: { solo: 1, st: custom(S[21], [['Drone_N', 2, 3.5, 0, 1.4], ['NightChick_N', 2, 3, 0, 1]], { enemySpd: 1.25 }), metric: (v) => v.dealt + v.taken },
      single: { st: custom(S[42], [['Rampart_N', 2, 9, 0, 1], ['Juggernaut_N', 10, 20, 0, 1]]), metric: (v) => v.dealt },
      area: { st: custom(S[22], [['NightChick_N', 1, 0.9, 0, 1], ['Legion_N', 3, 2.5, 0, 1]]), metric: (v) => v.dealt },
      tank: { solo: 1, st: custom(S[44], [['Fallen_N', 2, 3, 0, 1], ['Legion_N', 3, 3, 0, 1]]), metric: (v) => v.taken },
      swarm: { solo: 1, st: custom(S[47], [['Rampart_N', 2, 6, 0, 1.5], ['Fallen_N', 4, 7, 0, 1]]), metric: (v) => v.taken },
      evade: { solo: 1, st: custom(S[30], [['NightChick_N', 1, 0.7, 0, 1], ['Legion_N', 2, 2, 0, 1]]), metric: (v) => v.taken },
    };
  }
  // each role: the tag that marks its units and the scenario it is tested in (multi: several bodies against a swarm)
  const ROLE_TESTS = [['siege', 'siege', 'siege'], ['ship', 'ship', 'ship'], ['tower', 'tower', 'tower'], ['single', 'single', 'single'],
    ['area', 'area', 'area'], ['multi', 'multi', 'area'], ['tank', 'tank', 'tank'], ['swarm', 'swarm', 'swarm'], ['evade', 'evade', 'evade']];
  const ROLE_NAME = { siege: '건물만 노림', ship: '전투함', tower: '방어 타워', single: '단일 공격', area: '범위 공격', multi: '다수 배치', tank: 'HP 탱킹', swarm: '마릿수 탱킹', evade: '회피 탱킹' };

  async function unitsAndRoles(log, runs = 2, reuse, only) {
    const sc = scenarios(), L = 9, ids = D.UNITS.map((u) => u.id);
    const eff = reuse || {}; // scenario -> id -> value per money, rank-adjusted
    window.BAL.eff = eff;
    for (const [name, s] of Object.entries(sc)) {
      if (eff[name] || (only && !only.includes(name))) continue;
      eff[name] = {};
      for (const id of ids) {
        const v = await spotlight(s.st, id, L, runs, null, s.solo);
        eff[name][id] = v.spent ? s.metric(v) / v.spent / RANK_K[U[id].rank] : 0;
      }
      if (log) log(`scenario ${name} done`);
    }
    // units: each within ±35% of its rank's median in the ordinary battle (rank peers are what a squad slot is chosen
    // between; higher ranks are meant to be stronger). Siege units are valued by what they do to the fortress.
    const valOf = (id) => (has(id, 'siege') ? eff.siege[id] : eff.general[id]);
    const unitRows = ids.map((id) => {
      // towers hold the base, which the ordinary battle barely tests: valued in their own situation against their rank
      const peers = ids.filter((x) => U[x].rank === U[id].rank).map(U[id].tower ? (x) => eff.tower[x] : valOf);
      const val = U[id].tower ? eff.tower[id] : valOf(id), m = median(peers), dev = m && val ? Math.abs(Math.log2(val / m)) : 9;
      const score = Math.round(clamp(100 - Math.max(0, dev - Math.log2(1.35)) / (Math.log2(2.6) - Math.log2(1.35)) * 100, 0, 100));
      return { id, rank: U[id].rank, val: +val.toFixed(2), med: +m.toFixed(2), x: +(val / m).toFixed(2), score };
    });
    const units = Math.round(mean(unitRows.map((r) => r.score)));
    // roles
    const roleRows = ROLE_TESTS.map(([role, tag, scn]) => {
      const mem = ids.filter((id) => has(id, tag));
      const ranks = new Set(mem.map((id) => U[id].rank));
      const coverage = mem.length >= 2 ? (ranks.size >= 2 ? 20 : 12) : mem.length ? 6 : 0;
      const others = ids.filter((id) => !mem.includes(id)).map((id) => eff[scn][id]);
      // against a typical other unit (the median; the mean when most others score nothing there)
      const best = Math.max(...mem.map((id) => eff[scn][id]), 0), med = median(others) || mean(others) || 1e-9;
      const adv = Math.min(9, best / med);
      const niche = Math.round(60 * clamp((adv - 1) / 0.3, 0, 1));
      // usable: its members hold their own against their rank peers in the ordinary battle (val / rank median)
      const rel = (id) => { const v = has(id, 'siege') ? eff.siege[id] : eff.general[id]; const m = median(ids.filter((x) => U[x].rank === U[id].rank).map((x) => eff.general[x])); return m ? v / m : 0; };
      const gen = median(mem.map(rel));
      const usable = Math.round(20 * clamp((gen - 0.5) / 0.3, 0, 1));
      return { role: ROLE_NAME[role], members: mem.join(','), coverage, adv: +adv.toFixed(2), niche, gen: +gen.toFixed(2), usable, score: coverage + niche + usable };
    });
    const roles = Math.round(mean(roleRows.map((r) => r.score)));
    return { units, roles, unitRows, roleRows, eff };
  }

  // difficulty calibration: for each sampled stage, the factor on enemy strength and fortress HP at which the squad of
  // that point in the campaign, every card at level 10, wins with 35-75% of its base left (levels 11-12 make it easier)
  async function calibrate(log, chapters = [0, 1, 2, 3, 4, 5, 6, 7], stages = SAMPLE) {
    const out = [];
    for (const c of chapters) for (const s of stages) {
      const base = D.STAGES[c * 10 + s], ids = expectedDeck(c), L = 9; // every card at level 10 (battle level 9)
      let lo = 0.25, hi = 10, k = 1;
      for (let it = 0; it < 7; it++) {
        const st = Object.assign({}, base, { pow: base.pow * k, baseHp: Math.round(base.baseHp * k), finale: false });
        const r = await battle(st, squad(ids, L));
        const tooEasy = r.win && r.base > 0.75, tooHard = !r.win || r.base < 0.35;
        if (!tooEasy && !tooHard) break;
        if (tooEasy) lo = k; else hi = k;
        k = Math.sqrt(lo * hi);
      }
      out.push({ code: base.code, g: base.ix, k: +k.toFixed(2) });
      if (log) log(`calibrate ${base.code}: x${k.toFixed(2)}`);
    }
    return out;
  }

  async function all(opt = {}) {
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;inset:10px;z-index:99;overflow:auto;background:rgba(0,0,10,.92);color:#cfe;font:12px monospace;padding:12px;margin:0';
    document.body.appendChild(box);
    const log = (s) => { box.textContent += s + '\n'; console.log(s); };
    const out = {};
    if (!opt.skip || !opt.skip.includes('ur')) Object.assign(out, await unitsAndRoles(log, opt.runs || 2, opt.eff));
    if (!opt.skip || !opt.skip.includes('level')) out.level = await level(log);
    if (!opt.skip || !opt.skip.includes('difficulty')) out.difficulty = await difficulty(log);
    log('\n== SCORES ==');
    log(`레벨 밸런스 ${out.level && out.level.score} · 난이도 완성도 ${out.difficulty && out.difficulty.score} · 캐릭터 밸런스 ${out.units} · 캐릭터 활용도 ${out.roles}`);
    (out.roleRows || []).forEach((r) => log(`  ${r.role}: ${r.score} (구성 ${r.coverage} · 전문 ${r.niche} [x${r.adv}] · 범용 ${r.usable} [x${r.gen}]) ${r.members}`));
    window.BAL.last = out;
    return out;
  }

  window.BAL = { all, calibrate, level, difficulty, unitsAndRoles, battle, bot, expectedLevel, expectedDeck, needLevel, spotlight, scenarios, squad };
})();
