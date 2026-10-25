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
  // (the tutorial battle, 1-1, is the three starters alone; the rest of chapter 1 adds the tutorial pull's Valkyrie, the
  // one card the tutorial puts in the squad)
  function expectedDeck(c, ix) {
    if (ix === 0) return D.STARTERS.slice();
    if (c === 0) return D.STARTERS.concat('valkyrie');
    const ids = ['brownie', 'leprechaun', 'gnome', 'banshee', 'amy'].concat(D.STAGE_REWARD.slice(0, c));
    if (c >= 1) ids.push('daphne');
    if (c >= 3) ids.push('andvari');
    if (c >= 4) ids.push('labiata'); // the first SS (the making's pity reaches it around here)
    const out = [];
    let cost = 0;
    for (const id of ids) { const k = D.formationCost(id); if (out.length < 10 && cost + k <= D.DECK_CAP && !out.includes(id)) { out.push(id); cost += k; } }
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
  const breathe = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); ch.port2.close(); r(); }; ch.port2.postMessage(0); });
  async function battle(st, deck, opt = {}) {
    await GAME.preload(st, deck.map((d) => U[d.id]), () => {});
    GAME.start(st, deck.map((d) => ({ def: U[d.id], lv: d.lv })), {});
    const G = GAME.state;
    if (opt.setup) opt.setup(G);
    const T = opt.T || 600;
    let n = 0;
    while (!G.over && G.t < T) { (opt.bot || bot)(G, deck); GAME.sim(0.25); if (++n % 80 === 0) await breathe(); }
    const r = { win: G.over === 'win', over: G.over || 'time', t: G.t, deploys: G.deploys, base: G.base.hp / G.base.max, ebase: G.ebase.hp / G.ebase.max, stat: G.stat };
    GAME.stop();
    return r;
  }
  const squad = (ids, lv) => ids.map((id) => ({ id, lv }));
  // margin of a run: a win scores 1 + base HP left (and speed), a loss what share of the fortress fell
  const margin = (r) => (r.win ? 1 + 0.6 * r.base + 0.4 * clamp(1 - r.t / 600, 0, 1) : 1 - r.ebase);

  // ── 1. level balance ──
  // every card starts at level 10 (battle level 9) and goes to 12: the level-10 squad of that point in the campaign
  // clears each stage, and the same squad at level 12 does clearly better (levels matter)
  async function level(log) {
    const rows = [];
    for (let c = 0; c < 8; c++) for (const s of SAMPLE) {
      const st = D.STAGES[c * 10 + s], ids = expectedDeck(c, st.ix);
      const a = await battle(st, squad(ids, D.relLv('B', 10))), b = await battle(st, squad(ids, D.relLv('B', D.MAX_LV)));
      // levels matter: level 12 wins where 10 lost, keeps clearly more of its base, or clears clearly faster
      const ok = a.win && a.base >= 0.3, felt = (b.win && !a.win) || (b.win && (b.base - a.base >= 0.15 || a.t >= b.t * 1.2));
      rows.push({ code: st.code, win: a.win, base: +a.base.toFixed(2), t: Math.round(a.t), high: b.win ? +b.base.toFixed(2) : 'lose', highT: Math.round(b.t), ok, felt });
      if (log) log(`level ${st.code} ${ok ? 'ok' : 'FAIL'} ${felt ? '' : '(levels barely matter)'}`);
    }
    const pass = rows.filter((r) => r.ok).length / rows.length, felt = rows.filter((r) => r.felt).length / rows.length;
    return { score: Math.round(100 * (0.7 * pass + 0.3 * felt)), pass, felt, rows };
  }

  // ── 2. difficulty curve ──
  async function needLevel(st, ids, from = 1) { // the lowest battle level that clears it (16: none up to 15)
    for (let L = from; L <= 15; L++) { const r = await battle(st, squad(ids, L)); if (r.win && r.base >= 0.2) return L; }
    return 16;
  }
  // every card starts at level 10 (battle level 9), so every stage must clear at battle level 9; below that, the lowest
  // battle level that clears is a probe of how much a stage asks. The target curve climbs from 1 (1-1) to 9 (8-10).
  const targetLevel = (g) => Math.round(1 + 8 * g / 79);
  async function difficulty(log) {
    const rows = [];
    for (let c = 0; c < 8; c++) for (const s of SAMPLE) {
      const st = D.STAGES[c * 10 + s], E = targetLevel(st.ix), ids = expectedDeck(c);
      const R = await needLevel(st, ids, Math.max(1, E - 6));
      rows.push({ code: st.code, g: st.ix, E, R, kind: st.last ? 'boss' : st.elite ? 'elite' : '' });
      if (log) log(`need ${st.code}: L${R} (target L${E})`);
    }
    // in reach (the starting card level 10, battle level 9, clears it) and on the curve (within 3 of the target)
    const reach = rows.filter((r) => r.R <= 9 && Math.abs(r.R - r.E) <= 3).length / rows.length;
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
        setup: (G) => { G.money = 1500 * (D.VALUE || 1); G.base.hp = G.base.max *= 20; G.ebase.hp = G.ebase.max *= 4; if (setup) setup(G); },
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
  const RANK_K = Object.fromEntries(D.RANK_ORDER.map(rank => [rank, D.RANKS[rank].k]));
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

  // a tower against its closest-cost rank peers: the campaign's boss stages (chapters 3-8), the squad of that point
  // without SS at card level 10 plus the tested unit; mean margin of the tower / mean margin of the peers
  async function towerRatio(id, runs) {
    const peers = D.UNITS.filter((u) => u.rank === U[id].rank && !u.tower && !u.roles.includes('siege'))
      .sort((a, b) => Math.abs(a.cost - U[id].cost) - Math.abs(b.cost - U[id].cost)).slice(0, 3).map((u) => u.id);
    const play = async (x) => {
      let m = 0, n = 0;
      for (const g of [29, 49, 59, 79]) for (let k = 0; k < runs; k++) {
        const c = Math.floor(g / 10), ids = expectedDeck(c).filter((y) => U[y].rank !== 'SS' && !U[y].tower).slice(0, 9);
        m += margin(await battle(D.STAGES[g], squad([...ids, x], 9))); n++;
      }
      return m / n;
    };
    const mine = await play(id);
    let theirs = 0;
    for (const p of peers) theirs += await play(p);
    return mine / (theirs / peers.length);
  }

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
    // between; higher ranks are meant to be stronger). The ordinary battle's metric already counts fortress damage, so
    // siege units are read there too (the siege scenario's fortress-per-money is on another scale).
    // Towers hold the base, which the measuring window barely reaches: each is played in the campaign's boss stages in
    // place of its closest-cost rank peers, and its result against theirs is its ratio.
    if (!eff.campaign) {
      eff.campaign = {};
      for (const id of ids.filter((x) => U[x].tower)) eff.campaign[id] = await towerRatio(id, runs);
      if (log) log('towers done');
    }
    const valOf = (id) => eff.general[id];
    const unitRows = ids.map((id) => {
      const peers = ids.filter((x) => U[x].rank === U[id].rank && !U[x].tower).map(valOf);
      const m = median(peers), val = U[id].tower ? eff.campaign[id] * m : valOf(id), dev = m && val ? Math.abs(Math.log2(val / m)) : 9;
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
      const rel = (id) => { const v = U[id].tower ? eff.campaign[id] * median(ids.filter((x) => U[x].rank === U[id].rank).map((x) => eff.general[x])) : eff.general[id]; const m = median(ids.filter((x) => U[x].rank === U[id].rank).map((x) => eff.general[x])); return m ? v / m : 0; };
      const gen = median(mem.map(rel));
      const usable = Math.round(20 * clamp((gen - 0.5) / 0.3, 0, 1));
      return { role: ROLE_NAME[role], members: mem.join(','), coverage, adv: +adv.toFixed(2), niche, gen: +gen.toFixed(2), usable, score: coverage + niche + usable };
    });
    const roles = Math.round(mean(roleRows.map((r) => r.score)));
    return { units, roles, unitRows, roleRows, eff };
  }

  // difficulty calibration: for each sampled stage, the factor on enemy strength and fortress HP at which the squad of
  // that point in the campaign, every card at level 10, wins both of two runs keeping 40-85% of its base at worst
  // (battles tend to end in a rout either way, so the level-10 squad is asked to win safely; levels 11-12 then win faster)
  async function calibrate(log, chapters = [0, 1, 2, 3, 4, 5, 6, 7], stages = SAMPLE) {
    const out = [];
    for (const c of chapters) for (const s of stages) {
      const base = D.STAGES[c * 10 + s], ids = expectedDeck(c, base.ix);
      let lo = 0, hi = 0, k = 1;
      for (let it = 0; it < 6; it++) {
        const st = Object.assign({}, base, { pow: base.pow * k, baseHp: Math.round(base.baseHp * k), finale: false });
        let worst = 1;
        for (let r = 0; r < 2; r++) { const x = await battle(st, squad(ids, 9)); worst = Math.min(worst, x.win ? x.base : 0); }
        if (worst > 0.85) { lo = k; k = hi ? Math.sqrt(k * hi) : k * 1.3; } else if (worst < 0.4) { hi = k; k = lo ? Math.sqrt(k * lo) : k * 0.75; } else break;
      }
      out.push({ code: base.code, g: base.ix, k: +k.toFixed(3) });
      if (log) log(`calibrate ${base.code}: x${k.toFixed(2)}`);
    }
    return out;
  }

  // ── 5 / 6. feel: an ordinary player, and how long the front line holds ──
  // casual commander: two income upgrades, reacts once a second, picks a random card it can bank for and waits until it
  // can pay for it (no tank-first ordering, no cost planning), fires the cannon as soon as it is charged and anything is
  // near. A worse player than bot(), on purpose.
  function casualBot(seed) {
    let next = 0, want = -1, r = seed * 9301 + 49297;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    return (G, deck) => {
      if (G.t < next) return;
      next = G.t + 1;
      if (G.worker < 2 && G.money >= D.WORKER.cost[G.worker]) { GAME.upgradeWorker(); return; }
      const towers = G.allies.filter((a) => !a.dead && a.def.tower).length;
      const can = (i) => G.cds[i] <= 0 && !GAME.onField(U[deck[i].id]) && !(U[deck[i].id].tower && towers >= 2) && U[deck[i].id].cost <= GAME.wallet();
      if (want < 0 || !can(want)) {
        const ok = deck.map((d, i) => i).filter(can);
        want = ok.length ? ok[Math.floor(rnd() * ok.length)] : -1;
      }
      if (want >= 0 && G.money >= U[deck[want].id].cost) { GAME.deploy(want); want = -1; }
      if (G.cannon >= D.CANNON.charge && G.enemies.some((e) => !e.dead && e.x < D.CANNON.reach + 1)) GAME.fireCannon();
    };
  }
  // tanks: the original's defenders (보호기) on the line, towers and battleships excluded
  const isWall = (u) => u.guard && !u.tower && !u.ship;
  async function feel(log, stages) {
    const rows = [], lives = [], allLives = [], paces = [];
    for (let c = 0; c < 8; c++) for (const s of SAMPLE) {
      const st = D.STAGES[c * 10 + s], ids = expectedDeck(c, st.ix), dk = squad(ids, 9);
      if (stages && !stages.includes(st.ix)) continue;
      // the ordinary player
      const cas = await battle(st, dk, { bot: casualBot(st.ix + 1) });
      // the front line under the standard commander: each wall unit's time on the field (until it falls or the end)
      // and every unit's time on the field (how often the player has to send replacements)
      const born = new Map(), life = [], lifeAll = [];
      const track = (G, deck) => {
        for (const a of G.allies) if (!a.def.tower && !born.has(a)) born.set(a, G.t);
        for (const [a, t0] of born) if (a.dead && t0 != null) { (isWall(a.def) ? life : lifeAll).push(G.t - t0); born.set(a, null); }
        bot(G, deck);
      };
      const std = await battle(st, dk, { bot: track });
      for (const [a, t0] of born) if (t0 != null) (isWall(a.def) ? life : lifeAll).push(Math.max(0, std.t - t0)); // still standing at the end
      lifeAll.push(...life);
      const med = life.length ? median(life) : null, medAll = lifeAll.length ? median(lifeAll) : 0;
      if (med != null) lives.push(med);
      allLives.push(medAll);
      const pace = cas.deploys / Math.max(1, cas.t / 60); // the ordinary player's deploys per minute
      paces.push(pace);
      const ok = cas.win && cas.base >= 0.25;
      rows.push({ code: st.code, casual: cas.win ? +cas.base.toFixed(2) : 'lose', ok, tank: med == null ? '-' : +med.toFixed(1), n: life.length, life: +medAll.toFixed(1), pace: +pace.toFixed(1), stdPace: +(std.deploys / Math.max(1, std.t / 60)).toFixed(1) });
      if (log) log(`feel ${st.code}: casual ${cas.win ? 'W ' + Math.round(cas.base * 100) + '%' : cas.over + ' e' + Math.round(cas.ebase * 100) + '%'} · wall life ${med == null ? '-' : med.toFixed(1) + 's'} (${life.length}) · unit life ${medAll.toFixed(1)}s · deploys/min ${pace.toFixed(1)}`);
    }
    // an ordinary player clears with a quarter of the base left (a close win counts half)
    const casual = rows.reduce((a, r) => a + (r.ok ? 1 : r.casual !== 'lose' ? 0.5 : 0), 0) / rows.length;
    // the wall holds: median time on the field per stage, 20 s or more full marks, 8 s or less none
    const tank = mean(lives.map((m) => clamp((m - 8) / 12, 0, 1)));
    // control load: units last long enough that replacements are an occasional call, not a constant drill
    // (median time on the field of every unit per stage: 30 s or more full marks, 10 s or less none)
    const load = mean(allLives.map((m) => clamp((m - 10) / 20, 0, 1)));
    return { casual: Math.round(100 * casual), tank: Math.round(100 * tank), load: Math.round(100 * load), tankMed: +median(lives).toFixed(1), lifeMed: +median(allLives).toFixed(1), paceMed: +median(paces).toFixed(1), rows };
  }

  // difficulty for an ordinary player: the factor on a sampled stage's enemy strength and fortress HP at which the casual
  // commander (two seeds) with that point's squad at card level 10 wins both runs keeping lo..hi of its base at worst
  async function calibrateCasual(log, chapters = [0, 1, 2, 3, 4, 5, 6, 7], stages = SAMPLE, lo0 = 0.3, hi0 = 0.75) {
    const out = [];
    for (const c of chapters) for (const s of stages) {
      const base = D.STAGES[c * 10 + s], ids = expectedDeck(c, base.ix);
      let lo = 0, hi = 0, k = 1, worst = 0;
      for (let it = 0; it < 7; it++) {
        const st = Object.assign({}, base, { pow: base.pow * k, baseHp: Math.round(base.baseHp * k), finale: false });
        worst = 1;
        for (let r = 0; r < 2; r++) { const x = await battle(st, squad(ids, 9), { bot: casualBot(base.ix * 7 + r + 1) }); worst = Math.min(worst, x.win ? x.base : 0); }
        if (worst > hi0) { lo = k; k = hi ? Math.sqrt(k * hi) : k * 1.25; } else if (worst < lo0) { hi = k; k = lo ? Math.sqrt(k * lo) : k * 0.75; } else break;
      }
      out.push({ code: base.code, g: base.ix, k: +k.toFixed(3), worst: +worst.toFixed(2) });
      if (log) log(`casual calibrate ${base.code}: x${k.toFixed(2)} (worst base ${Math.round(worst * 100)}%)`);
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
    if (!opt.skip || !opt.skip.includes('feel')) out.feel = await feel(log);
    const parts = [out.level && out.level.score, out.difficulty && out.difficulty.score, out.units, out.roles, out.feel && out.feel.casual, out.feel && out.feel.tank, out.feel && out.feel.load].filter((v) => v != null);
    out.total = Math.round(mean(parts));
    log('\n== SCORES ==');
    log(`종합 ${out.total} · 레벨 밸런스 ${out.level && out.level.score} · 난이도 완성도 ${out.difficulty && out.difficulty.score} · 캐릭터 밸런스 ${out.units} · 캐릭터 활용도 ${out.roles} · 체감 난이도 ${out.feel && out.feel.casual} · 탱커 생존 ${out.feel && out.feel.tank} (중앙 ${out.feel && out.feel.tankMed}초) · 조작 부담 ${out.feel && out.feel.load} (대원 생존 중앙 ${out.feel && out.feel.lifeMed}초, 분당 출격 ${out.feel && out.feel.paceMed})`);
    (out.roleRows || []).forEach((r) => log(`  ${r.role}: ${r.score} (구성 ${r.coverage} · 전문 ${r.niche} [x${r.adv}] · 범용 ${r.usable} [x${r.gen}]) ${r.members}`));
    window.BAL.last = out;
    return out;
  }

  window.BAL = { all, feel, casualBot, calibrate, calibrateCasual, level, difficulty, unitsAndRoles, battle, bot, expectedLevel, expectedDeck, needLevel, spotlight, scenarios, squad };
})();
