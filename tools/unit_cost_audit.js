// 저장하지 않는 로컬 검증 화면에서만 실행한다.
(async function () {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !new URLSearchParams(location.search).has('unlock')) return;
  const D = DATA, rows = [], box = document.createElement('pre');
  box.id = 'unit-cost-report';
  box.style.cssText = 'position:fixed;inset:0;z-index:100;background:#101820;color:white;overflow:auto;padding:16px';
  document.body.appendChild(box);
  const scenarios = {
    ground: [['NightChick_N', 3, 2.5, 0, 1], ['Legion_N', 6, 5, 0, 1], ['Rampart_N', 15, 12, 0, 1]],
    ranged: [['Drone_N', 3, 5, 0, 1], ['Phalangites_N', 10, 10, 0, 1], ['Centurion_N', 15, 12, 0, 1]],
  };
  const report = { cardLevel: 10, seconds: 120, workerIndex: 3, startMoney: 0, seeds: [71, 157], units: D.UNITS, rows };
  const publish = async () => { await fetch('/__unit_cost_audit', { method: 'POST', body: JSON.stringify(report) }); };
  try {
    for (const u of D.UNITS) for (const [scenario, spawns] of Object.entries(scenarios)) for (const seed of report.seeds) {
      let rng = seed;
      const random = Math.random;
      Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
      let first = null, births = 0;
      const stage = Object.assign({}, D.STAGES[33], { pow: 2, enemyHpK: 1, enemyAtkK: 1, baseHp: 10000000, boss: null, finale: false, elite: false, last: false,
        spawns, rush: { at: 0.5, spawns: [] }, incomeK: 1, cannonK: 1, enemySpd: 1, startMoney: 0 });
      try {
        const ids = [u.id, ...['gnome', 'leprechaun'].filter(id => id !== u.id)];
        const result = await BAL.battle(stage, ids.map(id => ({ id, lv: D.relLv(D.UNIT[id].rank, 10) })), {
          T: 120,
          setup: G => { G.money = 0; G.worker = 3; G.base.hp = G.base.max = 10000000; },
          bot: G => {
            if (G.cds[0] <= 0 && !GAME.onField(u) && G.money >= u.cost) {
              if (GAME.deploy(0)) { if (first == null) first = G.t; births++; }
            }
            // 측정 대원의 소환 전력을 남겨 두고, 여유 전력으로 공통 호위만 배치한다.
            if (G.money >= u.cost + 500) for (let i = 1; i < ids.length; i++) GAME.deploy(i);
          },
        });
        const stat = result.stat;
        rows.push({ id: u.id, scenario, seed, first, births, dealt: stat.dealt[u.id] || 0, fort: stat.fort[u.id] || 0,
          taken: stat.taken[u.id] || 0, spent: stat.spent[u.id] || 0, base: result.base, t: result.t });
      } finally { Math.random = random; }
      box.textContent = `${rows.length}/160\n${u.name}\n${scenario}`;
      if (rows.length % 8 === 0) await publish();
    }
    report.done = true;
    await publish();
    box.textContent = '검사 완료\n' + JSON.stringify(report);
  } catch (error) { report.error = String(error.stack || error); await publish(); box.textContent = report.error; }
})();
