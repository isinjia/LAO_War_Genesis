(async function () {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !new URLSearchParams(location.search).has('unlock')) return;
  const box = document.createElement('pre');
  box.id = 'enemy-cannon-report';
  box.style.cssText = 'position:fixed;inset:0;z-index:120;background:#123;color:white;padding:16px';
  document.body.appendChild(box);
  const checks = [];
  const check = (name, pass) => { checks.push({ name, pass: !!pass }); if (!pass) throw Error(name); };
  try {
    const st = Object.assign({}, DATA.STAGES[0], { pow: 2, enemyHpK: 1, enemyAtkK: 1, spawns: [], rush: { at: 0.5, spawns: [] }, boss: null, finale: false });
    const defs = [0, 1, 2].map(i => Object.assign({}, DATA.UNIT.leprechaun, { spd: 0, range: 0, guard: 0, evade: 0, fly: i === 2 ? 1 : 0 }));
    await GAME.preload(st, defs, () => {});
    GAME.start(st, defs.map(def => ({ def, lv: DATA.relLv('B', 10) })), {});
    const G = GAME.state;
    G.money = 10000;
    const probes = [];
    for (let i = 0; i < defs.length; i++) {
      if (!GAME.deploy(i)) throw Error('시험 대원 배치 실패');
      const f = G.allies.at(-1);
      f.hp = f.max = 1000000;
      f.x = G.len / 2 + [-2, 2, 4][i];
      probes.push(f);
    }
    G.ebase.hp = G.ebase.max * 0.51;
    GAME.sim(0.1);
    check('증원 전 발사하지 않음', !G.enemyCannonFire);
    G.ebase.hp = G.ebase.max * 0.49;
    GAME.sim(0.1);
    const first = G.enemyCannonFire;
    check('증원 시 포격 준비', first && G.rushDone);
    check('충전 예고 중 피해 없음', probes.every(f => f.hp === 1000000));
    GAME.fireCannon();
    GAME.sim(0.5);
    check('아군·적군 레이저 무늬 독립', G.cannonFire.body.material.map !== first.layers[2].material.map);
    GAME.sim(1.3);
    check('중앙 밖 아군 보호', probes[0].hp === 1000000);
    check('적진 지상 대원 한 번 타격', probes[1].hp === 999400);
    check('적진 공중 대원 한 번 타격', probes[2].hp === 999400);
    GAME.sim(2);
    check('추가 중복 피해 없음', probes[1].hp === 999400 && probes[2].hp === 999400);
    check('발사 후 효과 정리', G.enemyCannonFire === null);
    check('같은 증원 조건에서 재발사 없음', G.rushDone && G.enemyCannonFire !== first);
    G.rushDone = false;
    GAME.sim(0.1);
    G.base.hp = 0;
    GAME.sim(0.1);
    check('전투 종료 시 준비 중 포격 정리', G.enemyCannonFire === null);
    box.textContent = JSON.stringify({ done: true, checks });
  } catch (error) { box.textContent = JSON.stringify({ done: false, checks, error: String(error.stack || error) }); }
  finally { GAME.stop(); }
})();
