// 로컬 전용 전 구간 검증. 모든 대원은 실제 카드 10레벨이며 저장 데이터를 사용하지 않는다.
(async function () {
  const q = new URLSearchParams(location.search);
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !q.has('unlock')) return;
  const phase = q.get('audit') || 'baseline';
  const reportSet = q.get('auditSet') || 'campaign';
  const panel = document.createElement('pre'); panel.id = 'campaign-audit';
  panel.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:#101923;color:#fff;padding:20px;white-space:pre-wrap';
  document.body.append(panel);
  const out = { phase, reportSet, cardLevel: 10, rows: [] };
  const render = () => { panel.textContent = JSON.stringify(out); };
  try {
    if (!['baseline', 'fit', 'verify'].includes(phase)) throw new Error('지원하지 않는 검증 종류입니다.');
    if (!/^[a-z][a-z_]{0,40}$/.test(reportSet)) throw new Error('지원하지 않는 검증 기록 이름입니다.');
    while (!window.BAL) await new Promise((r) => setTimeout(r, 100));
    const D = DATA;
    out.units = D.UNITS.map(({ id, cost, hp, atk }) => ({ id, cost, hp, atk }));
    function deck(st, expanded = false) {
      const rewards = D.CHAPTER_REWARD.slice(0, st.chapter + (st.hard ? 1 : 0));
      const ids = [...new Set([...D.STARTERS, ...(st.ix > 0 || st.hard ? ['valkyrie'] : []), ...rewards])];
      if (expanded && st.chapter > 0) ids.push(...['daphne', 'banshee', 'amy', 'andvari'].filter((id) => !ids.includes(id)));
      const chosen = ids.slice(0, 10);
      const cost = chosen.reduce((sum, id) => sum + D.DECK_COST[D.UNIT[id].rank], 0);
      if (cost > D.DECK_CAP) throw new Error('검증 편성이 실제 편성 비용 제한을 초과했습니다.');
      return chosen.map((id) => ({ id, lv: D.relLv(D.UNIT[id].rank, 10) }));
    }
    const target = (st) => st.last ? 300 : st.hard ? 240 : st.chapter === 0 ? 180 : 210;
    const minimum = (st) => st.hard ? 0.2 : 0.4;
    async function run(st, seed, expanded = false) {
      const controller = BAL.casualBot(seed);
      let firstDamage = null, peak = 0;
      const r = await BAL.battle(st, deck(st, expanded), { T: phase === 'fit' ? target(st) + 1 : 600, bot: (g, dk) => {
        if (firstDamage == null && g.base.hp < g.base.max) firstDamage = +g.t.toFixed(1);
        peak = Math.max(peak, g.allies.filter((a) => !a.dead).length);
        controller(g, dk);
      } });
      return { win: r.win, over: r.over, t: +r.t.toFixed(1), base: +r.base.toFixed(3), enemy: +r.ebase.toFixed(3), deploys: r.deploys, firstDamage, peak };
    }
    const ok = (st, r) => r.win && r.t <= target(st) && r.base >= minimum(st);
    const stages = [...D.STAGES, ...D.HARD];
    let freshPrevious = null;
    if (q.has('fresh')) {
      const previous = await (await fetch(`tools/reports/${reportSet}_verify.json?t=${Date.now()}`)).json();
      if (!previous.complete || previous.rows.length !== 160 || previous.rows.some((r) => !r.pass)) throw new Error('추가 검사는 전 구간 통과 후 실행합니다.');
      if (!previous.units || JSON.stringify(previous.units) !== JSON.stringify(out.units)) throw new Error('대원 수치가 달라 전 구간 새 검사가 필요합니다.');
      freshPrevious = new Map(previous.rows.map((r) => [r.code, r]));
    }
    if (q.has('resume') || q.has('retry')) {
      const previous = await (await fetch(`tools/reports/${reportSet}_${phase}.json?t=${Date.now()}`)).json();
      if (previous.phase !== phase || previous.cardLevel !== 10) throw new Error('재개할 검증 기록이 일치하지 않습니다.');
      if (!previous.units || JSON.stringify(previous.units) !== JSON.stringify(out.units)) throw new Error('대원 수치가 달라 기존 검증을 재사용할 수 없습니다.');
      out.rows = previous.rows.filter((r) => {
        const st = stages.find((s) => s.code === r.code);
        const unchanged = st && r.hpK === (st.enemyHpK || 1) && r.atkK === (st.enemyAtkK || 1) && r.fort === st.baseHp;
        return unchanged && (!q.has('retry') || r.pass);
      });
    }
    const completed = new Set(out.rows.map((r) => r.code));
    for (const st of stages.filter((s) => !completed.has(s.code))) {
      const row = { code: st.code, chapter: st.chapter, hard: !!st.hard, ids: deck(st).map((d) => d.id), hpK: st.enemyHpK || 1, atkK: st.enemyAtkK || 1, fort: st.baseHp, runs: [] };
      if (phase === 'fit') {
        // 기존 단계 구성은 유지하고 문제 구간의 적 체력과 공격력을 독립적으로 낮춘다.
        const trial = { ...st, finale: false };
        for (let attempt = 0; attempt < 12; attempt++) {
          const runs = [await run(trial, 17), await run(trial, 43)];
          row.attempts = attempt + 1; row.runs = runs;
          if (runs.every((r) => ok(trial, r))) break;
          if (runs.some((r) => r.over === 'lose' || r.base < minimum(trial))) trial.enemyAtkK = +(Math.max(0.06, (trial.enemyAtkK || 1) * 0.78)).toFixed(4);
          if (runs.some((r) => !r.win || r.t > target(trial))) trial.enemyHpK = +(Math.max(0.06, (trial.enemyHpK || 1) * 0.8)).toFixed(4);
          if (runs.some((r) => r.t > target(trial))) trial.baseHp = Math.max(1200, Math.round(trial.baseHp * 0.85 / 100) * 100);
        }
        row.hpK = trial.enemyHpK || 1; row.atkK = trial.enemyAtkK || 1; row.fort = trial.baseHp;
      } else {
        if (freshPrevious) {
          const previous = freshPrevious.get(st.code);
          row.runs = previous.runs.slice();
          if (previous.expanded) row.expanded = previous.expanded;
        }
        for (const seed of freshPrevious ? [307] : phase === 'verify' ? [71, 109, 157, 307] : [17]) row.runs.push(await run({ ...st, finale: false }, seed));
        if (!freshPrevious && phase === 'verify' && st.chapter > 0) row.expanded = await run({ ...st, finale: false }, 211, true);
      }
      row.pass = row.runs.every((r) => ok(st, r)) && (!row.expanded || ok(st, row.expanded));
      out.rows.push(row); render();
      if (out.rows.length % 10 === 0) await fetch('/__audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) }).catch(() => {});
    }
    out.complete = true; render(); panel.dataset.done = 'true';
    await fetch('/__audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) }).catch(() => {});
  } catch (e) { out.error = String(e.stack || e); render(); panel.dataset.done = 'error'; }
})();
