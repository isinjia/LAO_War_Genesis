// 현재 생산 시간과 적 포격을 포함한 고비용 최고 등급 실전 비교. 로컬 저장 방지 모드 전용.
(async function () {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !new URLSearchParams(location.search).has('unlock')) return;
  const D = DATA, rows = [], box = document.createElement('pre'); box.id = 'high-cost-audit';
  box.style.cssText = 'position:fixed;inset:0;z-index:999;background:#123;color:white;overflow:auto;padding:16px';
  document.body.appendChild(box);
  const seeds = [71, 157], core = ['brownie', 'leprechaun', 'gnome', 'andvari', 'valkyrie'];
  const candidates = D.UNITS.filter(u => u.rank === 'SS' && u.cost >= 1200).map(u => u.id)
    .concat(['khan', 'leona', 'hela', 'zero', 'hraesvelgr', 'phoenix', 'thetis', 'gnome', 'amy']);
  const stages = [D.STAGES[71], D.STAGES[79], D.HARD[73]];
  const profiles = candidates.map(id => ({ kind: 'unit', id, ids: [id, ...core.filter(x => x !== id)] }));
  profiles.push({ kind: 'deck', id: 'all_ss', ids: ['blacklilith', 'eternity', 'blindprincess', 'leona', 'mercury', 'zero', 'lrl', 'khan', 'hela', 'ullr'] });
  profiles.push({ kind: 'deck', id: 'mixed', ids: ['brownie', 'leprechaun', 'gnome', 'amy', 'valkyrie', 'andvari', 'phoenix', 'thetis', 'hraesvelgr', 'undine'] });
  const report = { productionEnabled: true, formationPointCap: false, cardLevel: 10, seeds, core, units: D.UNITS, rows, total: profiles.length * stages.length * seeds.length };
  const publish = async () => { await fetch('/__high_cost', { method: 'POST', body: JSON.stringify(report) }).catch(() => {}); };
  const guarded = new URLSearchParams(location.search).has('guarded');
  function frontline(g, deck) {
    const live = g.allies.filter(a => !a.dead);
    for (const [id, count] of [['gnome', 2], ['leprechaun', 1], ['brownie', 3]]) {
      const index = deck.findIndex(slot => slot.id === id);
      if (index >= 0 && live.filter(a => a.def.id === id).length < count && !GAME.productionState(index) && g.cds[index] <= 0 && g.money >= D.UNIT[id].cost) GAME.deploy(index);
    }
    if (g.worker < 3 && g.money >= D.WORKER.cost[g.worker]) GAME.upgradeWorker();
    if (!GAME.productionState(0) && g.cds[0] <= 0 && !GAME.onField(D.UNIT[deck[0].id]) && g.money >= D.UNIT[deck[0].id].cost) GAME.deploy(0);
    if (GAME.productionState(0) || g.cds[0] > 0 || GAME.onField(D.UNIT[deck[0].id])) BAL.bot(g, deck);
    if (g.cannon >= D.CANNON.charge && g.enemies.filter(e => !e.dead && e.x < g.len / 2).length >= 2) GAME.fireCannon();
  }
  try {
    if (guarded) {
      const previous = await (await fetch('tools/reports/high_cost_current.json')).json();
      if (!previous.done) throw Error('이전 비교가 완료되지 않았습니다');
      rows.push(...previous.rows.map(row => ({ strategy: 'priceFirst', ...row })));
      const chosen = ['ullr', 'tiamat', 'constantia', 'empress', 'labiata'];
      profiles.splice(0, profiles.length, ...profiles.filter(profile => profile.kind === 'unit' && chosen.includes(profile.id)));
      report.total = rows.length + profiles.length * stages.length * seeds.length;
    }
    while (!window.BAL) await new Promise(resolve => setTimeout(resolve, 50));
    for (const profile of profiles) for (const stage of stages) for (const seed of seeds) {
      let firstOrder = null, firstArrival = null, deployments = 0, activeSeconds = 0, pendingSeconds = 0;
      const born = new Set();
      const result = await BAL.battle({ ...stage, finale: false }, profile.ids.map(id => ({ id, lv: D.relLv(D.UNIT[id].rank, 10) })), {
        seed,
        bot: (g, deck) => {
          if (profile.kind === 'unit') {
            const live = g.allies.filter(a => !a.dead && a.def.id === profile.id);
            for (const a of live) if (!born.has(a)) { born.add(a); deployments++; if (firstArrival == null) firstArrival = g.t; }
            if (live.length) activeSeconds += 0.25;
            if (GAME.productionState(0)) pendingSeconds += 0.25;
          }
          (guarded ? frontline : BAL.bot)(g, deck);
          if (profile.kind === 'unit' && firstOrder == null && GAME.productionState(0)) firstOrder = g.t;
        },
      });
      rows.push({ strategy: guarded ? 'frontline' : 'priceFirst', id: profile.id, kind: profile.kind, ids: profile.ids, code: stage.code, seed, win: result.win, over: result.over,
        t: result.t, base: result.base, enemy: result.ebase, firstOrder, firstArrival, deployments, activeSeconds, pendingSeconds,
        own: profile.kind === 'unit' ? Object.fromEntries(['dealt', 'fort', 'taken', 'spent'].map(key => [key, result.stat[key][profile.id] || 0])) : null });
      box.textContent = `${rows.length}/${report.total}\n${D.UNIT[profile.id]?.name || profile.id}\n${stage.code}`;
      if (rows.length % 6 === 0) await publish();
    }
    report.done = true; await publish(); box.textContent = JSON.stringify(report);
  } catch (error) { report.error = String(error.stack || error); await publish(); box.textContent = report.error; }
})();
