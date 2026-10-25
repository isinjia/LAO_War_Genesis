// 실제 전투 엔진으로 전열 배치와 공중 판정을 검사한다. 로컬 시험 모드 전용이다.
(async function () {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !new URLSearchParams(location.search).has('unlock')) return;
  const panel = document.createElement('pre'); panel.id = 'formation-report';
  panel.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:99999;background:#101923;color:#fff;padding:20px;white-space:pre-wrap';
  document.body.append(panel);
  const out = { reportSet: 'range_roles', phase: 'formation', cardLevel: 10, rows: [] };
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const show = () => { panel.textContent = JSON.stringify(out); };
  try {
    while (!window.BAL) await new Promise((r) => setTimeout(r, 100));
    const D = DATA;
    const stage = (enemy) => ({ ...D.STAGES[0], pow: 1, baseHp: 100000000, len: 24, spawns: [[enemy, 0, 9999, 1, 1]], boss: null, rush: null, finale: false });
    async function fixture(name, ids, enemy, duration, control, evaluate) {
      try {
        const sent = new Set(); let prepared = false, evidence;
        const result = await BAL.battle(stage(enemy), ids.map((id) => ({ id, lv: D.relLv(D.UNIT[id].rank, 10) })), {
          T: duration, setup: (g) => { g.money = 1000000; },
          bot: (g) => {
            const foe = g.enemies.find((a) => !a.dead);
            if (foe && !prepared) {
              prepared = true; foe.x = 18; foe.hp = foe.maxHp = 100000000; foe.atk = 0; foe.def.spd = 0; foe.def.kb = 0;
            }
            control(g, ids, sent, foe);
            evidence = evaluate(g, foe, false);
          },
        });
        check(prepared, '검사 대상 적이 생성되지 않았습니다.');
        check(evidence && evidence.pass, '전투 동작이 기대와 다릅니다: ' + JSON.stringify(evidence));
        out.rows.push({ name, pass: true, ...evidence, t: +result.t.toFixed(1) });
      } catch (e) { out.rows.push({ name, pass: false, error: String(e.stack || e) }); }
      show();
    }
    function send(g, ids, sent, delayGuard = false) {
      ids.forEach((id, i) => { if (!sent.has(i) && (!delayGuard || i !== 0 || g.t >= 10) && GAME.deploy(i)) sent.add(i); });
    }
    for (const guard of ['gnome', 'blacklilith', 'blindprincess', 'eternity']) {
      const ids = guard === 'gnome' ? [guard, 'brownie', 'leprechaun'] : [guard, 'labiata', 'khan'];
      await fixture(D.UNIT[guard].name + ' 후발 출격 후 최전열 배치', ids, 'Legion_N', 70,
        (g, roster, sent) => send(g, roster, sent, true),
        (g) => {
          const tank = g.allies.find((a) => !a.dead && a.def.id === guard);
          const others = g.allies.filter((a) => !a.dead && a.def.id !== guard);
          const front = others.length ? Math.max(...others.map((a) => a.x)) : 0;
          return { pass: !!tank && others.length > 0 && tank.x > front + 0.4 && tank.x > 10, guard: tank && +tank.x.toFixed(2), attackers: +front.toFixed(2) };
        });
    }
    for (const guard of ['undine', 'azazel', 'saraqael', 'sleipnir']) {
      await fixture(D.UNIT[guard].name + ' 지상 근접 적 통과·비공격 유지', [guard], 'Legion_N', 32,
        (g, roster, sent, foe) => { send(g, roster, sent); if (foe) { foe.def.spd = 1.2; foe.atk = 100; } },
        (g, foe) => {
          const tank = g.allies.find((a) => !a.dead && a.def.id === guard);
          return { pass: !!tank && !!foe && foe.x < tank.x - 0.7 && tank.hp === tank.maxHp, guard: tank && +tank.x.toFixed(2), enemy: foe && +foe.x.toFixed(2), undamaged: !!tank && tank.hp === tank.maxHp };
        });
    }
    for (const id of ['zero', 'labiata', 'blacklilith', 'blindprincess', 'mercury', 'leprechaun']) {
      const ranged = id === 'leprechaun';
      await fixture(D.UNIT[id].name + (ranged ? ' 원거리 대공 양성 대조' : ' 지상 근접 대공 불가'), [id], 'Drone_N', 45,
        (g, roster, sent) => send(g, roster, sent),
        (g, foe) => ({ pass: !!foe && (ranged ? foe.hp < foe.maxHp : foe.hp === foe.maxHp), damage: foe ? Math.round(foe.maxHp - foe.hp) : 0 }));
    }
    out.complete = true; out.pass = out.rows.every((r) => r.pass); panel.dataset.done = out.pass ? 'true' : 'failed'; show();
    await fetch('/__audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) }).catch(() => {});
  } catch (e) { out.error = String(e.stack || e); panel.dataset.done = 'error'; show(); }
})();
