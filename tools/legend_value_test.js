// 같은 전력 한도에서 최고 등급 한 명 제한과 상급의 누적 생산을 직접 비교한다.
(async function () {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !new URLSearchParams(location.search).has('unlock')) return;
  const D = DATA, panel = document.createElement('pre'); panel.id = 'legend-value-report';
  panel.style.cssText = 'position:fixed;inset:0;z-index:999;background:#123;color:white;overflow:auto;padding:16px'; document.body.appendChild(panel);
  const report = { budget: 3600, seconds: 90, cardLevel: 10, seeds: [71, 157], rows: [], units: D.UNITS };
  const pairs = [['titania', 'phoenix'], ['lemonadealpha', 'thetis'], ['fafnir', 'thetis'], ['constantia', 'hraesvelgr'],
    ['empress', 'phoenix'], ['ullr', 'hraesvelgr'], ['tiamat', 'phoenix'], ['eternity', 'undine']];
  const scenarios = {
    swarm: [['NightChick_N', 0.5, 1.5, 0, 1], ['Centurion_N', 4, 7, 0, 1], ['Juggernaut_N', 10, 20, 0, 1]],
    ranged: [['Intruder_N', 1, 8, 0, 1], ['Phalangites_N', 4, 10, 0, 1], ['Centurion_N', 7, 9, 0, 1]],
  };
  const publish = async () => { await fetch('/__legend_value', { method: 'POST', body: JSON.stringify(report) }).catch(() => {}); };
  try {
    const prior = await (await fetch('tools/reports/high_cost_before_discount.json')).json();
    const old = Object.fromEntries(prior.units.map(u => [u.id, u]));
    while (!window.BAL) await new Promise(resolve => setTimeout(resolve, 50));
    for (const [ss, s] of pairs) for (const [scenario, spawns] of Object.entries(scenarios)) for (const seed of report.seeds) {
      for (const side of ['s', 'before', 'after']) {
        const id = side === 's' ? s : ss, original = D.UNIT[id];
        if (side === 'before') D.UNIT[id] = old[id];
        const unit = D.UNIT[id];
        let remaining = report.budget, orders = 0, firstArrival = null, peak = 0;
        try {
          const stage = { ...D.STAGES[2], pow: 6, enemyHpK: 2, enemyAtkK: 0.3, spawns, boss: null, rush: null,
            finale: false, last: false, elite: false, baseHp: 100000000, simulationSeed: seed };
          const result = await BAL.battle(stage, [{ id, lv: D.relLv(unit.rank, 10) }], {
            seed, T: report.seconds,
            setup: g => { g.money = remaining; g.worker = 3; g.base.hp = g.base.max = 100000000; },
            bot: g => {
              const live = g.allies.filter(a => !a.dead);
              peak = Math.max(peak, live.length);
              if (firstArrival == null && live.length) firstArrival = g.t;
              g.money = remaining; // 전력 수입과 처치 보상을 재사용하지 않는다.
              if (!GAME.productionState(0) && !GAME.onField(unit) && g.cds[0] <= 0 && remaining >= unit.cost && GAME.deploy(0)) { remaining -= unit.cost; orders++; }
            },
          });
          if (unit.rank === 'SS' && peak > 1) throw Error('최고 등급 동시 출격 제한 위반');
          const spent = result.stat.spent[id] || 0;
          if (spent > report.budget) throw Error('동일 전력 한도 초과');
          report.rows.push({ ss, s, side, scenario, seed, id, cost: unit.cost, production: unit.production, cd: unit.cd,
            spent, orders, firstArrival, peak, dealt: result.stat.dealt[id] || 0, fort: result.stat.fort[id] || 0,
            taken: result.stat.taken[id] || 0, efficiency: spent ? ((result.stat.dealt[id] || 0) + (result.stat.fort[id] || 0)) / spent : 0 });
        } finally { D.UNIT[id] = original; }
        panel.textContent = `${report.rows.length}/96\n${D.UNIT[ss].name}\n${scenario}`;
        if (report.rows.length % 6 === 0) await publish();
      }
    }
    report.done = true; await publish(); panel.textContent = JSON.stringify(report);
  } catch (error) { report.error = String(error.stack || error); await publish(); panel.textContent = report.error; }
})();
