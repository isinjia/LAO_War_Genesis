// Balance bot: plays stages headless (GAME.sim) like a sensible player and reports the result.
// In the browser console on http://localhost:8790/?unlock=1 :
//   const s = document.createElement('script'); s.src = 'tools/balance_bot.js'; document.head.append(s);
//   await BOT.table([1, 3, 6])     // every stage at unit levels 1, 3 and 6 (no gacha units)
//   await BOT.table([1, 3], 2)     // the same with two random SS units in the squad
(function () {
  const D = window.DATA;

  // the squad a player has at stage ix without the gacha: starters + earlier stage rewards; `ss` adds that many SS units
  // ix: a campaign index or a stage object (hard / infinite / daily)
  const stageOf = (ix) => (typeof ix === 'number' ? D.STAGES[ix] : ix);
  function squad(ix, ss = 0) {
    const ids = [...D.STARTERS, ...D.CHAPTER_REWARD.slice(0, stageOf(ix).chapter)];
    const pool = D.UNITS.filter((u) => u.rank === 'SS').map((u) => u.id).sort(() => Math.random() - 0.5);
    ids.push(...pool.slice(0, ss));
    return ids.slice(-10).length < ids.length ? [...ids.slice(0, 2), ...ids.slice(-(8))] : ids;
  }

  async function run(ix, lv, limit = 900, ss = 0) {
    const st0 = stageOf(ix);
    const deck = (st0.squad || squad(ix, ss)).map((id) => ({ def: D.UNIT[id], lv: st0.squad ? st0.squadLv : lv })) // daily: its fixed squad and level
      .sort((a, b) => (a.def.id === 'brownie' ? -2 : a.def.id === 'leprechaun' ? -1 : a.def.cost) - (b.def.id === 'brownie' ? -2 : b.def.id === 'leprechaun' ? -1 : b.def.cost));
    await GAME.preload(stageOf(ix), deck.map((d) => d.def), () => {});
    GAME.start(stageOf(ix), deck, { onEnd: () => {} });
    const G = GAME.state;
    let t = 0, minBase = 1;
    while (!G.over && t < limit) {
      if (G.worker < 5 && G.money >= D.WORKER.cost[G.worker] && t > 2) GAME.upgradeWorker();
      const shields = G.allies.filter((a) => !a.dead && (a.def.id === 'brownie' || a.def.id === 'leprechaun')).length;
      const threat = G.enemies.some((e) => !e.dead && e.x < G.len * 0.45);
      if (shields < (threat ? 6 : 3)) { GAME.deploy(1); GAME.deploy(0); }
      // save for the best unit off cooldown that fits the wallet; when it is far off (or enemies are close), field
      // the best affordable one instead
      const cap = D.WORKER.cap[G.worker];
      let goal = -1;
      for (let i = deck.length - 1; i >= 2; i--) if (G.cds[i] <= 0 && deck[i].def.cost <= cap) { goal = i; break; }
      if (goal >= 0) {
        const wait = (deck[goal].def.cost - G.money) / D.WORKER.rate[G.worker];
        if (G.money >= deck[goal].def.cost) GAME.deploy(goal);
        else if (wait > 4 || threat) {
          for (let i = goal - 1; i >= 2; i--) if (G.cds[i] <= 0 && G.money >= deck[i].def.cost) { GAME.deploy(i); break; }
        }
      }
      if (G.cannon >= D.CANNON.charge && G.enemies.some((e) => !e.dead && e.x < 12)) GAME.fireCannon();
      deck.forEach((d, i) => { if (d.def.rank === 'SS' || d.def.rank === 'S') GAME.orderSkill(i); }); // ordered skills on cooldown
      GAME.sim(0.5);
      t += 0.5;
      minBase = Math.min(minBase, G.base.hp / G.base.max);
    }
    const r = { stage: stageOf(ix).code, lv, res: G.over || 'timeout', t: Math.round(t), base: Math.round(minBase * 100), ebase: Math.round((G.ebase.hp / G.ebase.max) * 100) };
    if (!G.over) { // what a stand-off looks like
      const pos = (list) => list.filter((f) => !f.dead).map((f) => `${f.def.id.slice(0, 5)}@${f.x.toFixed(0)}${f.state[0]}`).join(' ');
      r.allies = pos(G.allies); r.enemies = pos(G.enemies); r.money = Math.round(G.money);
    }
    GAME.stop();
    return r;
  }

  // daily operations over `n` days from today with the campaign reached up to `top` stages
  async function daily(n = 30, top = 80) {
    const d0 = Math.floor(Date.now() / 86400000), rows = [];
    for (let i = 0; i < n; i++) {
      const st = D.dailyStage(d0 + i, top);
      const r = await run(st, 0);
      rows.push(Object.assign(r, { base: st.code, name: st.name, mod: st.mod, lv: st.squadLv }));
    }
    const wins = rows.filter((r) => r.res === 'win').length;
    console.table(rows);
    return { wins, n, rate: Math.round((wins / n) * 100) + '%', rows };
  }

  // stages: indexes to play (default: each chapter's first and boss stage)
  async function table(levels, ss = 0, stages) {
    const rows = [];
    for (const ix of stages || D.STAGES.filter((s) => s.no === 1 || s.last).map((s) => s.ix)) {
      const row = [D.STAGES[ix].code];
      for (const lv of levels) {
        const r = await run(ix, lv, 900, ss);
        row.push(`lv${lv}:${r.res === 'win' ? 'W' : r.res === 'lose' ? 'L' : 'T'} ${r.t}s b${r.base}${r.res !== 'win' ? ' e' + r.ebase : ''}`);
      }
      rows.push(row.join(' | '));
    }
    return rows.join('\n');
  }

  window.BOT = { daily, run, table };
})();
