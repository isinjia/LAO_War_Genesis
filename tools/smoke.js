// Automated smoke test: http://localhost:8790/?unlock=1&smoke=1
// Boots, then runs every screen and battle mode headless (GAME.sim) and lists pass / fail on the page.
// ?unlock=1 keeps the real save untouched.
(function () {
  const results = [];
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:8px;top:8px;right:8px;z-index:99;background:rgba(0,0,0,.92);color:#eee;font:13px monospace;padding:10px;max-height:90vh;overflow:auto;border:1px solid #ffcc00';
  document.body.appendChild(panel);
  const show = () => { panel.innerHTML = '<b style="color:#ffcc00">SMOKE TEST</b><br>' + results.map(([ok, n, d]) => `<div style="color:${ok ? '#7f7' : '#f77'}">${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}</div>`).join(''); };
  const errors = [];
  addEventListener('error', (e) => errors.push(e.message));
  addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
  async function step(name, fn) {
    const e0 = errors.length;
    try { const d = await fn(); results.push([errors.length === e0, name, errors.length > e0 ? errors.slice(e0).join('; ') : d || '']); }
    catch (err) { results.push([false, name, String(err && err.stack || err).slice(0, 300)]); }
    show();
  }
  const D = window.DATA;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function battle(st, deckIds, secs) {
    APP.save.deck = deckIds;
    deckIds.forEach((id) => { APP.save.owned[id] = 1; });
    await APP.launch(st);
    const G = GAME.state;
    if (!G) throw new Error('no battle');
    G.worker = 6;
    for (let t = 0; t < secs; t += 1) {
      for (let i = 0; i < deckIds.length; i++) { G.cds[i] = 0; G.money = 3000; GAME.deploy(i); GAME.orderSkill(i); }
      GAME.sim(1);
      if (G.over) break;
    }
    return G;
  }

  (async function run() {
    await wait(800);
    await step('data: 80 stages, 80 hard, 40 units', () => {
      if (D.STAGES.length !== 80 || D.HARD.length !== 80 || D.UNITS.length !== 40) throw new Error('counts');
      for (const s of D.STAGES) if (!(s.spawns.length && s.baseHp > 0 && s.pow > 0)) throw new Error('bad stage ' + s.code);
      return 'ok';
    });
    await step('every unit has a rig, portrait and icon', () => {
      const miss = D.UNITS.filter((u) => !IMG['u_' + u.id]).map((u) => u.id);
      if (miss.length) throw new Error('icons ' + miss);
      return 'ok';
    });
    await step('operations: three modes, chapter navigation and no title exit', () => {
      APP.openLobby('campaign');
      const hub = document.getElementById('pOperations');
      if (!hub.classList.contains('on') || hub.querySelectorAll('[data-operation]').length !== 3) throw new Error('mode hub missing');
      const back = document.getElementById('btnBack');
      if (!back.hidden) throw new Error('root still has title exit');
      hub.querySelector('[data-operation="stages"]').click();
      if (!document.getElementById('pChapters').classList.contains('on')) throw new Error('no chapters');
      if (document.querySelectorAll('#chapterList .chap').length !== 8) throw new Error('mixed chapter list');
      document.querySelector('#chapterList [data-ch="0"]').click();
      if (!document.getElementById('pStages').classList.contains('on')) throw new Error('no stage map');
      back.click(); back.click();
      if (!hub.classList.contains('on') || !back.hidden) throw new Error('back hierarchy broken');
      return '3 modes, 8 chapters, map → chapters → modes';
    });
    await step('battle 1-1: deploy, fight, enemies spawn', async () => {
      const G = await battle(D.STAGES[0], ['brownie', 'leprechaun', 'gnome'], 40);
      if (!G.allies.length && !G.over) throw new Error('no allies');
      return `kills ${G.kills}, deploys ${G.deploys}`;
    });
    await step('ordered SS skill fires', async () => {
      const G = await battle(D.STAGES.find((s) => s.code === '3-10'), ['brownie', 'leprechaun', 'labiata', 'tiamat'], 30);
      return `skills used ${G.skillsUsed}`;
    });
    await step('win path → result', async () => {
      const G = GAME.state; G.ebase.hp = 0; GAME.sim(0.1);
      await wait(2900);
      if (!document.getElementById('modal').classList.contains('show')) throw new Error('no result popup');
      document.getElementById('modal').classList.remove('show'); GAME.stop();
      const p = D.periodic(APP.save);
      if (!(p.d.wins >= 1 && p.w.wins >= 1)) throw new Error('daily / weekly mission counters did not count the win');
      return 'ok, daily wins ' + p.d.wins;
    });
    await step('boss reveal: slow motion + letterbox, then back', async () => {
      const G = await battle(D.STAGES.find((s) => s.code === '1-10'), ['brownie', 'leprechaun', 'gnome'], 3);
      G.ebase.hp = G.ebase.max * (G.st.boss.at - 0.01); GAME.sim(0.1);
      if (!G.boss || !document.body.classList.contains('cine')) throw new Error('no reveal');
      GAME.stop();
      if (document.body.classList.contains('cine')) throw new Error('letterbox left on');
      return 'ok';
    });
    await step('hard stage + condition stage', async () => {
      let G = await battle(D.HARD[0], ['brownie', 'leprechaun', 'gnome'], 10); GAME.stop();
      G = await battle(D.STAGES.find((s) => s.mod === 'emp'), ['brownie', 'leprechaun', 'gnome', 'raven'], 10); GAME.stop();
      return 'ok';
    });
    await step('infinite floor 5 with buffs', async () => {
      const G = await battle(Object.assign(D.infiniteFloor(5), { buffs: ['atk', 'hp', 'income'] }), ['brownie', 'leprechaun', 'raven', 'tiamat'], 10);
      GAME.stop();
      return 'pow ' + G.st.pow;
    });
    await step('daily operation (fixed squad)', async () => {
      const st = D.dailyStage(Math.floor(Date.now() / 86400000), 40);
      await APP.launch(st);
      if (GAME.state.deck.length !== st.squad.length) throw new Error('squad');
      GAME.sim(5); GAME.stop();
      return st.name;
    });
    await step('story scene plays to the end', async () => {
      APP.openLobby('campaign');
      APP.playStory('c1_intro');
      for (let i = 0; i < 40; i++) document.getElementById('stBox').click();
      if (document.getElementById('story').classList.contains('show')) throw new Error('story stuck');
      return 'ok';
    });
    await step('gacha 10-pull', async () => {
      const p0 = APP.save.parts; APP.pull(10);
      await wait(300);
      document.getElementById('gresSkip').click(); await wait(200); document.getElementById('gresOk').click();
      if (APP.save.parts !== p0 - D.GACHA.cost10) throw new Error('parts');
      return 'ok';
    });
    await step('lobby screens render', async () => {
      for (const p of ['campaign', 'squad', 'gacha', 'missions']) APP.openLobby(p);
      APP.openLobby('campaign', 3);
      return 'ok';
    });
    await step('perf: 60 frames in a crowded fight', async () => {
      const G = await battle(D.STAGES.find((s) => s.code === '8-10'), ['brownie', 'leprechaun', 'gnome', 'impet', 'raven', 'phoenix', 'labiata', 'tiamat'], 25);
      const ms = GAME.bench(60);
      GAME.stop();
      if (ms > 16) throw new Error(ms.toFixed(1) + ' ms/frame');
      return `${ms.toFixed(2)} ms/frame, ${G.allies.length + G.enemies.length} fighters`;
    });
    const fails = results.filter((r) => !r[0]).length;
    results.push([!fails, `DONE: ${results.length - fails}/${results.length} passed`, errors.length ? 'errors: ' + errors.length : '']);
    show();
    window.SMOKE = { results, fails };
  })();
})();
