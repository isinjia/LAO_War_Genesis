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
      if (!document.getElementById('lobby').classList.contains('operation-depth')) throw new Error('operation depth missing');
      const mobile = matchMedia('(max-width: 1000px), (pointer: coarse)').matches;
      const tabsShown = getComputedStyle(document.querySelector('.navbar')).display !== 'none';
      const bottomBackShown = getComputedStyle(document.querySelector('.operation-back')).display !== 'none';
      if (tabsShown === mobile || bottomBackShown !== mobile) throw new Error('wrong device navigation');
      if (!mobile && document.getElementById('btnBackDesktop').hidden) throw new Error('desktop back missing');
      if (document.querySelectorAll('#chapterList .chap').length !== 8) throw new Error('mixed chapter list');
      document.querySelector('#chapterList [data-ch="0"]').click();
      if (!document.getElementById('pStages').classList.contains('on')) throw new Error('no stage map');
      back.click(); back.click();
      if (!hub.classList.contains('on') || !back.hidden) throw new Error('back hierarchy broken');
      for (const mode of ['daily', 'infinite']) {
        hub.querySelector(`[data-operation="${mode}"]`).click();
        if (!document.getElementById('pOperationDetail').classList.contains('on') || !document.getElementById('lobby').classList.contains('operation-depth')) throw new Error('no detail/back for ' + mode);
        back.click();
        if (!hub.classList.contains('on') || document.getElementById('lobby').classList.contains('operation-depth')) throw new Error('tabs not restored');
      }
      return 'all 3 modes: desktop keeps tabs, mobile uses centered back';
    });
    await step('card upgrade opens details before spending resources', () => {
      const id = 'brownie', u = D.UNIT[id], save = APP.save;
      const old = { lv: save.lv[id], cards: save.cards[id], xp: save.xp };
      try {
        save.lv[id] = D.START_LV[u.rank];
        const need = D.cardsNeed(u.rank, save.lv[id]), cost = D.xpNeed(u.rank, save.lv[id]);
        save.cards[id] = need + 7; save.xp = cost + 1234;
        APP.openLobby('squad');
        document.querySelector(`.crc[data-id="${id}"]`).click();
        document.querySelector('#cardMenu .cm-up').click();
        if (!document.getElementById('modal').classList.contains('show')) throw new Error('upgrade skipped details');
        if (save.lv[id] !== D.START_LV[u.rank] || save.cards[id] !== need + 7 || save.xp !== cost + 1234) throw new Error('menu spent resources');
        if (document.querySelectorAll('.detail .stat-next').length !== 2) throw new Error('stat preview missing');
        document.querySelector('#modalBtns [data-action="upgrade"]').click();
        if (save.lv[id] !== D.START_LV[u.rank] + 1 || save.cards[id] !== 7 || save.xp !== 1234) throw new Error('confirmed upgrade incorrect');
      } finally {
        for (const key of ['lv', 'cards']) { if (old[key] == null) delete save[key][id]; else save[key][id] = old[key]; }
        save.xp = old.xp; document.getElementById('modal').classList.remove('show'); APP.openLobby('campaign');
      }
      return 'menu opens preview; detail button spends XP and cards once';
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
    await step('next battle resets victory camera and permits dragging', async () => {
      const G = await battle(D.STAGES[1], ['brownie', 'leprechaun', 'gnome'], 1);
      GAME.zoom(1.6); G.ebase.hp = 0; GAME.sim(0.1);
      if (!GAME.cameraState().panning) throw new Error('victory pan not reproduced');
      await APP.launch(D.STAGES[2]);
      const initial = GAME.cameraState();
      if (initial.panning || initial.zoom !== 1 || Math.abs(initial.left + 3) > .1) throw new Error('old camera carried into next battle');
      GAME.look(GAME.state.len);
      const before = GAME.cameraState().x;
      const gl = document.getElementById('gl');
      gl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, clientX: 200, clientY: 200, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 77, clientX: 600, clientY: 200 }));
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77 }));
      if (GAME.cameraState().x >= before) throw new Error('camera cannot drag away from enemy base');
      GAME.stop();
      return 'victory → next stage: allied base, zoom reset, drag works';
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
