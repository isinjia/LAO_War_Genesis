(async function () {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !new URLSearchParams(location.search).has('unlock')) return;
  const checks = [], panel = document.createElement('div'); panel.id = 'production-test-report';
  panel.style.cssText = 'position:fixed;top:60px;left:12px;z-index:100;max-width:70%;padding:8px;background:#101820e8;color:white;font-size:12px';
  const text = document.createElement('pre'); panel.appendChild(text); document.body.appendChild(panel);
  const check = (name, pass) => { checks.push({ name, pass: !!pass }); if (!pass) throw Error(name); };
  const stage = { ...DATA.STAGES[2], spawns: [], rush: null, boss: null, finale: false, baseHp: 10000000 };
  APP.save.deck = ['sleipnir', 'phoenix', 'harpy', 'leprechaun', 'gnome', 'sleipnir'];
  APP.save.tut = 1;
  const launch = async st => { await APP.launch(st); const g = GAME.state; g.manualSim = true; g.worker = 7; g.money = 5000; return g; };
  try {
    let g = await launch(stage);
    const startMoney = g.money;
    check('생산 주문 접수', GAME.deploy(3));
    check('즉시 출현하지 않음', g.allies.length === 0 && GAME.productionState(3));
    check('전력 한 번 차감', g.money === startMoney - DATA.UNIT.leprechaun.cost);
    check('같은 칸 중복 주문 방지', !GAME.deploy(3) && g.money === startMoney - DATA.UNIT.leprechaun.cost);
    check('다른 칸 동시 생산', GAME.deploy(4) && g.productions.filter(Boolean).length === 2);
    GAME.sim(0.2);
    check('생산 완료 전 미출현', g.allies.length === 0 && g.cds[3] === 0);
    const remain = GAME.productionState(3).remaining;
    g.paused = true; GAME.sim(0.2);
    check('일시정지 중 생산 정지', GAME.productionState(3).remaining === remain);
    g.paused = false; GAME.sim(1);
    check('완료 시 출격과 재배치 시작', g.allies.length === 2 && g.deploys === 2 && g.cds[3] > 0 && !GAME.productionState(3));
    check('최고 등급 생산 접수', GAME.deploy(0));
    check('최고 등급 생산 중 같은 대원 예약 방지', !GAME.deploy(5));
    g.base.hp = 0; GAME.sim(0.1);
    check('전투 종료 시 생산 취소', g.over && g.productions.every(job => !job));
    g = await launch(stage);
    check('다음 전투에 생산 이월 없음', g.productions.every(job => !job) && g.allies.length === 0);
    GAME.deploy(0); GAME.sim(0.3); g.manualSim = false; g.paused = true;
    GAME.look(6);
    text.textContent = JSON.stringify({ done: true, checks });
    const effects = document.createElement('button'); effects.textContent = '효과 장면'; panel.appendChild(effects);
    effects.onclick = async () => {
      const st = { ...stage, pow: 1, enemyHpK: 1000, enemyAtkK: 0.001, spawns: [['Fallen_N', 0.1, 30, 1, 1]] };
      const scene = await launch(st);
      [0, 1, 2].forEach(i => GAME.deploy(i)); GAME.sim(4);
      scene.allies.forEach(f => { f.x = 7; }); scene.enemies.forEach(f => { f.x = 10; });
      let frames = 0;
      while (frames++ < 180) { GAME.sim(1 / 60); if (scene.bfx.length || scene.sfx.length) break; }
      GAME.sim(0.35);
      let impactFrames = 0;
      while (!scene.sfx.length && impactFrames++ < 90) GAME.sim(1 / 60);
      const effects = scene.bfx.map(b => ({ kind: 'projectile', span: b.inst.c.d.scale * b.inst.root.scale.x * 2 }))
        .concat(scene.sfx.map(inst => ({ kind: 'impact', span: inst.c.d.scale * inst.root.scale.x * 2 })));
      scene.manualSim = false; scene.paused = true; GAME.look(9);
      text.textContent = JSON.stringify({ done: true, checks, effects });
    };
  } catch (error) { text.textContent = JSON.stringify({ done: false, checks, error: String(error.stack || error) }); GAME.stop(); }
})();
