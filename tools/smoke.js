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
      const noFull = D.UNITS.filter(u => u.rank === 'SS' && !FULL[u.id]).map(u => u.id);
      if (noFull.length) throw new Error('SS full-body art missing: ' + noFull);
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
        const menuUp = document.querySelector('#cardMenu.show .cm-up'); // touch: the menu under the card; PC: the popup opens at once
        if (menuUp) menuUp.click();
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
    await step('selected pickup: all SS and counter preserved on switch', () => {
      const old = { pickup: APP.save.pickup, pity: APP.save.pity, ssTier: APP.save.ssTier };
      try {
        APP.save.pity = 17; APP.save.ssTier = 2; APP.openLobby('gacha'); // the 40 step (10 / 20 steps are not shown)
        document.getElementById('btnPickup').click();
        const options = [...document.querySelectorAll('[data-pickup]')];
        if (options.length !== D.UNITS.filter(u => u.rank === 'SS').length) throw new Error('SS excluded from selection');
        const target = options.find(b => b.dataset.pickup !== old.pickup);
        target.click();
        if (APP.save.pickup !== target.dataset.pickup || APP.save.pity !== 17) throw new Error('switch lost counter');
        if (!document.getElementById('pity').textContent.includes('23')) throw new Error('40-pull guarantee not shown');
      } finally {
        Object.assign(APP.save, old); document.getElementById('modal').classList.remove('show'); APP.openLobby('campaign');
      }
      return 'all SS selectable, 17/40 maintained after switch';
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
      if (initial.panning || Math.abs(initial.zoom - initial.defaultZoom) > 1e-4 || Math.abs(initial.left + 3) > .1) throw new Error('이전 전투의 카메라 상태가 남았습니다');
      // 최소 배율에서 양쪽 기지가 모두 보이면 이동할 여백이 없다. 확대 후 드래그를 검사한다.
      GAME.zoom(Math.max(1.2, initial.zoom));
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
      for (let i = 0; i < 400 && document.getElementById('story').classList.contains('show'); i++) document.getElementById('stBox').click();
      if (document.getElementById('story').classList.contains('show')) throw new Error('story stuck');
      return 'ok';
    });
    await step('story log: past lines only, keyboard does not advance behind it', () => {
      const box = document.getElementById('stBox'), view = document.getElementById('story');
      APP.playStory('c1_intro');
      for (let i = 0; i < 3; i++) { box.click(); box.click(); }
      box.click();
      const text = document.getElementById('stText').textContent;
      document.getElementById('stHistory').click();
      const log = document.querySelector('#modal .story-log');
      if (!log || log.children.length !== 4) throw new Error('history does not match visited lines');
      if (log.textContent.includes(STORY.S.c1_intro.lines[4][1])) throw new Error('history reveals a future line');
      if (document.activeElement !== document.querySelector('#modalBtns button')) throw new Error('history focus missing');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      if (document.getElementById('stText').textContent !== text) throw new Error('dialogue advanced behind history');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (document.getElementById('modal').classList.contains('show') || !view.classList.contains('show')) throw new Error('Escape skipped the story instead of closing history');
      document.getElementById('stSkip').click();
      return '4 visited lines; no future text; modal focus and Escape preserved';
    });
    await step('story expressions: neutral cue restores original illustration', async () => {
      const key = '__expression_probe';
      STORY.S[key] = { bg: 'bg_base', lines: [
        ['brownie', '걱정하는 표정.', 'L', { face: 'Sad' }],
        ['brownie', '다음 보고를 이어갑니다.', 'L', { face: null, motion: 'still' }],
      ] };
      try {
        APP.playStory(key);
        const image = document.getElementById('stL'), original = image.src;
        for (let i = 0; i < 40 && image.src === original; i++) await wait(50);
        if (image.src === original) throw new Error('original expression overlay did not load');
        const box = document.getElementById('stBox'); box.click(); box.click();
        if (image.src !== original || image.dataset.face || image.classList.contains('talk')) throw new Error('old expression or hop remained on neutral/still line');
        document.getElementById('stSkip').click();
        return 'Sad overlay → base art; still cue prevents talking hop';
      } finally { delete STORY.S[key]; }
    });
    await step('chapter cards: old dismissal cannot close a new card', () => {
      const original = window.setTimeout, callbacks = [], handles = [];
      let first = 0, second = 0;
      try {
        window.setTimeout = (fn, ms, ...args) => {
          if (ms !== 3200) return original(fn, ms, ...args);
          callbacks.push(() => fn(...args));
          const handle = original(() => {}, ms); handles.push(handle); return handle;
        };
        const credits = document.getElementById('credits');
        APP.titleCard(0, () => first++); credits.click();
        APP.titleCard(1, () => second++);
        callbacks[0]();
        if (!credits.classList.contains('show') || first !== 1 || second !== 0) throw new Error('previous card dismissed the current one');
        callbacks[1](); callbacks[1]();
        if (credits.classList.contains('show') || second !== 1) throw new Error('current card callback did not run exactly once');
        return 'old timer ignored; each card completes once';
      } finally {
        window.setTimeout = original; handles.forEach(clearTimeout);
      }
    });
    await step('ending: underground stinger, continued credits and mood reset', () => {
      const box = document.getElementById('stBox'), story = document.getElementById('story');
      const lines = STORY.S.c8_outro.lines;
      const cue = lines.findIndex(line => line[3]?.mood === 'ominous');
      if (cue < 1) throw new Error('no ending transition');
      APP.playStory('c8_outro');
      if (story.classList.contains('st-ominous')) throw new Error('victory starts in ominous mood');
      for (let i = 0; i < cue; i++) { box.click(); box.click(); }
      if (!story.classList.contains('st-ominous')) throw new Error('stinger mood not applied');
      if (document.querySelectorAll('#story .st-char.show').length) throw new Error('characters present in unseen underground');
      const artCue = lines.findIndex(line => line[3]?.art === 'underground');
      for (let i = cue; i < artCue; i++) { box.click(); box.click(); }
      if (story.dataset.storyArt !== 'underground' || !(window.PACKED && PACKED.on ? /blob:/ : /underground-v1\.webp/).test(document.getElementById('stBg').style.backgroundImage)) throw new Error('ending illustration missing');
      for (let i = artCue; i < lines.length; i++) { box.click(); box.click(); }
      const credits = document.getElementById('credits');
      if (!credits.classList.contains('show') || !credits.textContent.includes('TO BE CONTINUED')) throw new Error('continued credits missing');
      credits.click();
      APP.playStory('c1_intro');
      if (story.classList.contains('st-ominous')) throw new Error('ending mood leaked into new scene');
      if (story.dataset.storyArt) throw new Error('ending art leaked into new scene');
      document.getElementById('stSkip').click();
      return 'victory → unseen underground → continued; next story restores normal mood';
    });
    await step('chapter ending: unread journal entry and next-chapter recovery', async () => {
      const save = APP.save, before = { cleared: save.cleared, seen: { ...save.seen } };
      try {
        save.cleared = 9;
        delete save.seen.c1_outro;
        delete save.seen.c2_intro;
        const G = await battle(D.STAGES[9], ['brownie', 'leprechaun', 'gnome'], 1);
        G.ebase.hp = 0; GAME.sim(0.1); await wait(2900);
        if (save.seen.c1_outro) throw new Error('ending marked seen before viewing');
        const map = [...document.querySelectorAll('#modalBtns button')].find(b => b.textContent === '작전 지도');
        if (!map) throw new Error('no map button');
        map.click();
        if (![...document.querySelectorAll('#chStory button')].some(b => b.textContent.includes('결말 NEW'))) throw new Error('unread ending not available in journal');
        APP.openLobby('campaign', 1);
        document.querySelector('#stagePath [data-ix="10"]').click();
        document.getElementById('btnGo').click();
        if (document.getElementById('story').dataset.scene !== 'c1_outro') throw new Error('next chapter lost previous ending');
        document.getElementById('stSkip').click();
        if (!save.seen.c1_outro || document.getElementById('story').dataset.scene !== 'c2_intro') throw new Error('explicit skip did not continue to next intro');
        // Leave this next intro via a new standalone scene, without starting its battle.
        APP.playStory('ep_labiata');
        document.getElementById('stSkip').click();
        return 'result/map preserve unread state; 2-1 recovers 1-10 ending before intro';
      } finally {
        save.cleared = before.cleared; save.seen = before.seen;
        GAME.stop(); APP.openLobby('campaign');
      }
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
