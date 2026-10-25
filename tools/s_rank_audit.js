(async function () {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !new URLSearchParams(location.search).has('unlock')) return;
  const compareSS = new URLSearchParams(location.search).has('compareSS');
  const D = DATA, units = D.UNITS.filter(u => compareSS ? ['valkyrie', 'khan', 'zero', 'mercury', 'leona', 'ullr'].includes(u.id) : u.rank === 'S'), rows = [];
  const panel = document.createElement('pre'); panel.id = 's-rank-report';
  panel.style.cssText = 'position:fixed;inset:0;z-index:999;background:#123;color:white;overflow:auto;padding:16px'; document.body.appendChild(panel);
  const scenarios = {
    swarm: [['NightChick_N', 0.5, 1, 0, 1], ['Legion_N', 4, 3, 0, 1]],
    armor: [['Rampart_N', 1, 6, 0, 1], ['Phalangites_N', 4, 8, 0, 1], ['Centurion_N', 7, 6, 0, 1]],
    air: [['Drone_N', 1, 4, 0, 1], ['Intruder_N', 4, 6, 0, 1]],
  };
  const report = { cardLevel: 10, seeds: [71, 157], budget: 3600, units, rows, total: units.length * 12, compareSS };
  const publish = async () => { await fetch(compareSS ? '/__s_rank_ss' : '/__s_rank', { method: 'POST', body: JSON.stringify(report) }).catch(() => {}); };
  try {
    while (!window.BAL) await new Promise(resolve => setTimeout(resolve, 50));
    for (const mode of ['budget', 'campaign']) for (const u of units) {
      const cases = mode === 'budget' ? Object.entries(scenarios).map(([name, spawns]) => ({ name, stage: { ...D.STAGES[2], pow: 6, enemyHpK: 2, enemyAtkK: 0.3,
        spawns, boss: null, rush: null, finale: false, last: false, elite: false, baseHp: 100000000 } }))
        : [D.STAGES[71], D.STAGES[79], D.HARD[73]].map(stage => ({ name: stage.code, stage: { ...stage, finale: false } }));
      for (const c of cases) for (const seed of report.seeds) {
        const ids = mode === 'budget' ? [u.id] : [u.id, 'brownie', 'leprechaun', 'gnome', 'amy'];
        let remaining = report.budget, first = null, peak = 0, controlSeconds = 0, liveSeconds = 0;
        const result = await BAL.battle(c.stage, ids.map(id => ({ id, lv: D.relLv(D.UNIT[id].rank, 10) })), {
          seed, T: mode === 'budget' ? 90 : 600,
          setup: g => { if (mode === 'budget') { g.money = remaining; g.worker = 3; g.base.hp = g.base.max = 100000000; } },
          bot: (g, deck) => {
            const live = g.allies.filter(a => !a.dead && a.def.id === u.id);
            if (live.length && first == null) first = g.t;
            peak = Math.max(peak, live.length); liveSeconds += live.length * 0.25;
            controlSeconds += g.enemies.reduce((n, e) => n + (!e.dead && e.slowT > 0 ? e.slowK * 0.25 : 0), 0);
            if (mode === 'budget') {
              g.money = remaining;
              if (!GAME.productionState(0) && !GAME.onField(u) && g.cds[0] <= 0 && remaining >= u.cost && GAME.deploy(0)) remaining -= u.cost;
            } else BAL.bot(g, deck);
          },
        });
        const spent = result.stat.spent[u.id] || 0;
        if (mode === 'budget' && spent > report.budget) throw Error('전력 한도 초과');
        rows.push({ mode, id: u.id, case: c.name, seed, win: result.win, over: result.over, time: result.t, base: result.base, first, peak,
          controlSeconds, liveSeconds, spent, dealt: result.stat.dealt[u.id] || 0, fort: result.stat.fort[u.id] || 0, taken: result.stat.taken[u.id] || 0 });
        panel.textContent = `${rows.length}/${report.total}\n${u.name}\n${c.name}`;
        if (rows.length % 6 === 0) await publish();
      }
    }
    report.done = true; await publish(); panel.textContent = JSON.stringify(report);
  } catch (error) { report.error = String(error.stack || error); await publish(); panel.textContent = report.error; }
})();
