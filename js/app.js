// Screens, save data, lobby (campaign chapters / stages, squad, making), story player, battle HUD and results.
(function () {
  const D = window.DATA;
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'lao_war_genesis_v1';
  const DECK_MAX = 10;

  // ── save ───────────────────────────────────────────────
  // cleared: stages cleared in order (campaign progress), stars: best stars per stage, seen: story scenes watched,
  // xp: upgrade points, tuna: gacha currency, lv: unit levels, owned: { id: 1 }, deck: unit ids sent into battle,
  // pity: pulls since the last SS
  // parts: making (gacha) currency, tuna: recruit-shop currency; hardCleared / hstars: hard mode; infBest: infinite front record
  let save = { v: 3, cleared: 0, stars: {}, seen: {}, xp: 0, parts: D.GACHA.startParts, tuna: D.GACHA.startTuna, lv: {}, owned: null, deck: null,
    pity: 0, pulls: 0, hardCleared: 0, hstars: {}, infBest: 0 };
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { /* fresh save */ }
  if (stored) {
    Object.assign(save, stored);
    if (!stored.v) { save.cleared = Math.min(D.STAGES.length, (stored.cleared || 0) * D.PER_CH); save.v = 2; } // 8-stage saves: one stage was one chapter
    if (save.v < 3) { save.parts = D.GACHA.startParts + (stored.tuna || 0) * 2; save.tuna = D.GACHA.startTuna; save.v = 3; } // tuna used to pay for the making
  }
  save.stars = save.stars || {};
  save.seen = save.seen || {};
  if (!save.owned) {
    save.owned = {};
    D.STARTERS.forEach((id) => { save.owned[id] = 1; });
  }
  // chapter rewards already earned
  D.CHAPTERS.forEach((ch, c) => { if (save.cleared >= ch.first + D.PER_CH) save.owned[D.CHAPTER_REWARD[c]] = 1; });
  if (save.tuna == null) save.tuna = D.GACHA.startTuna;
  save.hstars = save.hstars || {};
  save.deck = (save.deck || []).filter((id) => save.owned[id] && D.UNIT[id]);
  while (deckCost(save.deck) > D.DECK_CAP) save.deck.splice(save.deck.reduce((m, id, i, a) => (D.DECK_COST[D.UNIT[id].rank] > D.DECK_COST[D.UNIT[a[m]].rank] ? i : m), 0), 1);
  if (!save.deck.length) save.deck = autoDeck();
  // three deck presets (덱 1 / 2 / 3); save.deck is the active one, copied into save.decks on every save
  if (!Array.isArray(save.decks) || save.decks.length !== 3) save.decks = [save.deck.slice(), [], []];
  save.deckIx = save.deckIx || 0;
  save.decks = save.decks.map((d) => (d || []).filter((id) => save.owned[id] && D.UNIT[id]));
  let noSave = false; // ?unlock=1 test runs never write the real save
  let saveWarned = false;
  const persist = () => {
    if (save.decks) save.decks[save.deckIx || 0] = save.deck.slice();
    if (noSave) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {
      if (!saveWarned) { saveWarned = true; GAME.toast('저장 실패 — 브라우저 저장소를 확인하세요 (설정 > 세이브 내보내기)', true); }
    }
  };
  // cards: save.lv = card level (1-15, starts by rank), save.cards = copies on hand, save.wild = wild cards by rank
  if (!save.cardsV) { // older saves: battle levels (1-20) and core links → card levels and copies
    const old = save.lv || {};
    save.lv = {};
    for (const id in save.owned) {
      const u = D.UNIT[id];
      if (u) save.lv[id] = Math.min(D.MAX_LV, D.START_LV[u.rank] + Math.max(0, (old[id] || 1) - 1));
    }
    save.cards = {};
    for (const id in save.link || {}) { const u = D.UNIT[id]; if (u) save.cards[id] = (save.link[id] || 0) * D.PULL_CARDS[u.rank][1]; }
    delete save.link;
    save.cardsV = 1;
  }
  save.cards = save.cards || {};
  save.wild = Object.assign({ B: 0, A: 0, S: 0, SS: 0 }, save.wild || {});
  const lvOf = (id) => save.lv[id] || D.START_LV[D.UNIT[id].rank];
  const relOf = (id) => D.relLv(D.UNIT[id].rank, lvOf(id)); // the battle level
  const cardsOf = (id) => save.cards[id] || 0;
  const owned = (id) => !!save.owned[id];
  const rankIx = (u) => D.RANK_ORDER.indexOf(u.rank);

  function deckCost(ids) { return ids.reduce((a, id) => a + D.DECK_COST[D.UNIT[id].rank], 0); }
  const fits = (id) => save.deck.length < DECK_MAX && deckCost(save.deck) + D.DECK_COST[D.UNIT[id].rank] <= D.DECK_CAP;
  function autoDeck() {
    const out = [];
    D.UNITS.filter((u) => save.owned[u.id]).sort((a, b) => a.cost - b.cost).forEach((u) => {
      if (out.length < DECK_MAX && deckCost(out) + D.DECK_COST[u.rank] <= D.DECK_CAP) out.push(u.id);
    });
    return out;
  }
  // a new unit joins the formation by itself while there is room (slots and cost)
  function grant(id, keepOut) {
    if (save.owned[id]) return false;
    save.owned[id] = 1;
    save.lv[id] = save.lv[id] || D.START_LV[D.UNIT[id].rank];
    if (!keepOut && fits(id)) save.deck.push(id); // (the tutorial's pull leaves the squad to the player)
    return true;
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('show', s.id === id));
  }
  const rk = (r) => `<i class="rk-i ${r}"></i>`;
  const hasFull = (id) => !!(window.FULL && FULL[id]);
  const art = (id) => (hasFull(id) ? FULL[id] : IMG['u_' + id]);
  // an <img> showing the illustration, or the portrait framed as a card when the unit has none
  const setArt = (img, id) => { img.src = art(id); img.classList.toggle('portrait', !hasFull(id)); };
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (n) => Math.round(n).toLocaleString();
  const shuffle = (list) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ── title ──────────────────────────────────────────────
  const VERSION = 'V0.46'; // shown at the title's bottom right and in the settings
  $('ver').textContent = VERSION;
  document.querySelector('#title .title-bg').style.backgroundImage = `url(${IMG.bg_title})`;
  $('lobbyBg').style.backgroundImage = `url(${IMG.bg_title})`;
  if (window.UIA) $('logo').src = UIA.logo.u;
  // a commander who hasn't finished the tutorial goes straight into it: the story intro, then 1-1 with the coach,
  // with the squad set up for it (the three starters, in the order the coach talks about them)
  // 설정 > 전체화면 (off by default): browsers allow it only from a tap, so it is asked for here and when switched on
  const fsEl = document.documentElement;
  const fsOk = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function enterFs() {
    if (!fsOk || fsOn()) return;
    try { const p = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) { /* refused */ }
  }
  function exitFs() {
    if (!fsOn()) return;
    try { const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }
  $('btnStart').onclick = () => {
    AUDIO.play('click', 1, 0.8);
    if (save.fullscreen) enterFs();
    if (!save.tut && save.cleared === 0) {
      D.STARTERS.forEach((id) => { save.owned[id] = 1; });
      save.deck = D.STARTERS.slice();
      persist();
      openLobby('campaign', 0);
      startStage(D.STAGES[0]);
      return;
    }
    openLobby('campaign');
  };
  AUDIO.music('title');

  // ── lobby ──────────────────────────────────────────────
  let pane = 'campaign', chapterOpen = -1, selStage = -1;
  // phones / narrow screens: the stage info is a sheet that opens only when a stage is tapped
  let sheetOpen = false;
  const sheetMode = () => matchMedia('(max-width: 1000px)').matches;
  const infoShown = () => !sheetMode() || sheetOpen;
  document.querySelectorAll('.nav').forEach((b) => { b.onclick = () => { AUDIO.play('click', 0.5, 1.35); setPane(b.dataset.pane); }; });
  $('btnBack').onclick = () => {
    AUDIO.play('click', 0.5);
    if (pane === 'campaign' && chapterOpen >= 0) { chapterOpen = -1; refresh(); }
    else if (pane !== 'campaign') setPane('campaign');
    else { show('title'); AUDIO.music('title'); }
  };

  function setPane(name) {
    pane = name;
    if (name !== 'campaign') chapterOpen = -1;
    document.querySelectorAll('.nav').forEach((x) => x.classList.toggle('on', x.dataset.pane === name));
    refresh();
  }

  function openLobby(name, chapter) {
    show('lobby');
    AUDIO.music('lobby');
    if (chapter != null) { pane = 'campaign'; chapterOpen = chapter; }
    setPane(name || pane);
  }

  const TITLES = { campaign: ['CAMPAIGN', '작전 지역'], squad: ['SQUAD', '대원 편성 · 강화'], gacha: ['MAKING', '대원 제조'], missions: ['MISSION', '임무'] };
  function refresh() {
    $('xpVal').textContent = fmt(save.xp);
    $('tunaVal').textContent = fmt(save.tuna);
    $('partsVal').textContent = fmt(save.parts);
    const inChapter = pane === 'campaign' && chapterOpen >= 0;
    $('pChapters').classList.toggle('on', pane === 'campaign' && !inChapter);
    $('pStages').classList.toggle('on', inChapter);
    $('pSquad').classList.toggle('on', pane === 'squad');
    $('pGacha').classList.toggle('on', pane === 'gacha');
    $('pMissions').classList.toggle('on', pane === 'missions');
    missionBadge();
    $('btnBack').classList.toggle('arrow', pane !== 'campaign' || inChapter);
    const [en, ko] = inChapter ? [`CHAPTER ${pad2(chapterOpen + 1)}`, D.CHAPTERS[chapterOpen].title] : TITLES[pane];
    $('tbEn').textContent = en; $('tbKo').textContent = ko;
    $('lobbyBg').style.backgroundImage = `url(${inChapter ? IMG[D.CHAPTERS[chapterOpen].bg] : IMG.bg_title})`;
    if (pane === 'campaign') inChapter ? renderStages() : renderChapters();
    if (pane === 'squad') renderSquad(); else { closeCardMenu(); swapIn = null; }
    if (pane === 'gacha') renderGacha();
    if (pane === 'missions') renderMissions();
  }

  // missions: progress, claim rewards once
  const mstate = (m) => { const [cur, goal] = m.goal(save); return { cur: Math.max(0, Math.min(cur, goal)), goal, done: cur >= goal, claimed: !!(save.claimed || {})[m.id] }; };
  // repeatable (daily / weekly) missions: counters in save.per, reset by D.periodic
  function bump(k, v) { if (!v) return; const p = D.periodic(save); p.d[k] = (p.d[k] || 0) + v; p.w[k] = (p.w[k] || 0) + v; }
  const pstate = (m, span) => { const p = D.periodic(save); const cur = (span === 'day' ? p.d : p.w)[m.key] || 0;
    return { cur: Math.min(cur, m.n), goal: m.n, done: cur >= m.n, claimed: !!(span === 'day' ? p.cd : p.cw)[m.id] }; };
  const resetIn = (span) => { const now = Date.now(), d = D.dayNo(now);
    const end = (span === 'day' ? d + 1 : d + 7 - ((d + 3) % 7)) * 86400000, h = Math.ceil((end - now) / 3600000);
    return h > 48 ? `${Math.floor(h / 24)}일 후 초기화` : `${h}시간 후 초기화`; };
  function missionBadge() {
    const n = D.MISSIONS.filter((m) => { const s = mstate(m); return s.done && !s.claimed; }).length +
      ['day', 'week'].reduce((a, sp) => a + D.PERIODIC[sp].filter((m) => { const s = pstate(m, sp); return s.done && !s.claimed; }).length, 0);
    $('missionBadge').textContent = n || '';
  }
  function renderMissions() {
    const box = $('missionList');
    box.innerHTML = '';
    const head = (t, sub) => { const h = document.createElement('div'); h.className = 'sec-title'; h.innerHTML = `<b>${t}</b><small>${sub}</small>`; box.appendChild(h); };
    const sortOf = (a, b) => (b.s.done && !b.s.claimed) - (a.s.done && !a.s.claimed) || a.s.claimed - b.s.claimed;
    for (const [sp, t] of [['day', '일일 임무'], ['week', '주간 임무']]) {
      head(t, resetIn(sp));
      D.PERIODIC[sp].map((m) => ({ m, s: pstate(m, sp) })).sort(sortOf).forEach(({ m, s }) => card(m, s, () => { const p = D.periodic(save); (sp === 'day' ? p.cd : p.cw)[m.id] = 1; }));
    }
    head('업적', '한 번만 받을 수 있는 누적 목표');
    D.MISSIONS.map((m) => ({ m, s: mstate(m) })).sort(sortOf).forEach(({ m, s }) => card(m, s, () => { save.claimed = save.claimed || {}; save.claimed[m.id] = 1; }));
  }
  function card(m, s, claim) {
    const box = $('missionList');
    {
      const el = document.createElement('div');
      el.className = 'mis' + (s.claimed ? ' claimed' : s.done ? ' done' : '');
      el.dataset.mid = m.id;
      const rw = [m.reward.tuna ? `<span class="t"><i class="tuna-i"></i>${fmt(m.reward.tuna)}</span>` : '', m.reward.parts ? `<span class="p"><i class="parts-i"></i>${fmt(m.reward.parts)}</span>` : '', wildHtml(m.reward.wild)].join('');
      el.innerHTML = `<div class="mi"><b>${m.name}</b><small>${m.desc}</small><div class="mbar"><i style="width:${(s.cur / s.goal) * 100}%"></i></div><small class="mp">${fmt(s.cur)} / ${fmt(s.goal)}</small></div>
        <div class="mr">${rw}</div><button class="btn${s.done && !s.claimed ? '' : ' d'}" ${s.done && !s.claimed ? '' : 'disabled'}>${s.claimed ? '완료' : s.done ? '받기' : '진행 중'}</button>`;
      if (s.done && !s.claimed) el.querySelector('button').onclick = () => {
        claim();
        save.tuna += m.reward.tuna; save.parts += m.reward.parts; addWild(m.reward.wild); persist();
        AUDIO.play('purchase'); refresh();
      };
      box.appendChild(el);
    }
  }

  // campaign: chapter cards (normal / hard) and the infinite front
  let mode = 'normal';
  const isHard = () => mode === 'hard';
  const list = () => (isHard() ? D.HARD : D.STAGES);
  const progress = () => (isHard() ? save.hardCleared : save.cleared);
  const starsOf = (s) => (s.hard ? save.hstars : save.stars)[s.ix] || 0;
  const normalDone = () => save.cleared >= D.STAGES.length;
  const chapterCleared = (c) => Math.max(0, Math.min(D.PER_CH, progress() - D.CHAPTERS[c].first));
  // a hard chapter opens once its normal chapter and the previous hard chapter are cleared
  const chapterLocked = (c) => (isHard()
    ? save.cleared < D.CHAPTERS[c].first + D.PER_CH || save.hardCleared < D.CHAPTERS[c].first
    : save.cleared < D.CHAPTERS[c].first);
  function renderChapters() {
    const box = $('chapterList');
    box.innerHTML = '';
    const tg = document.createElement('div');
    tg.className = 'mode-toggle';
    tg.innerHTML = `<button data-m="normal" class="${isHard() ? '' : 'on'}">NORMAL</button>` +
      `<button data-m="hard" class="hard ${isHard() ? 'on' : ''}">HARD</button>` +
      `<small>${isHard() ? '하드: 철충 강도 2배 이상 · 보상 1.6배 · 노말 챕터를 깨면 열림' : '노말 캠페인 · 스토리'}</small>`;
    tg.querySelectorAll('button').forEach((b) => { b.onclick = () => { mode = b.dataset.m; AUDIO.play('click', 0.5, 1.35); renderChapters(); }; });
    box.appendChild(tg);
    D.CHAPTERS.forEach((ch, c) => {
      const locked = chapterLocked(c);
      const n = chapterCleared(c);
      const face = D.CHAPTER_REWARD[c];
      const b = document.createElement('button');
      b.className = 'chap' + (locked ? ' locked' : '') + (n >= D.PER_CH ? ' done' : '') + (isHard() ? ' hard' : '');
      b.dataset.ch = c;
      b.innerHTML = `<div class="img" style="background-image:url(${IMG[ch.bg]})"></div>
        ${hasFull(face) ? `<img class="face" src="${FULL[face]}" alt="">` : ''}<i class="bar-top"></i>
        <span class="pc">${n}/${D.PER_CH}</span>
        <div class="txt"><div class="no">${isHard() ? 'HARD ' : ''}CHAPTER ${pad2(c + 1)}</div><div class="nm">${ch.title}</div><div class="sb">${ch.sub}</div>
        <div class="prog"><i style="width:${(n / D.PER_CH) * 100}%"></i></div></div>
        ${locked ? '<div class="lock"><i></i></div>' : ''}`;
      if (!locked) b.onclick = () => { AUDIO.play('click'); chapterOpen = c; selStage = -1; sheetOpen = false; refresh(); };
      box.appendChild(b);
    });
    // daily operation: after chapter 1
    const today = Math.floor(Date.now() / 86400000);
    const dly = document.createElement('button');
    const dOpen = save.cleared >= D.PER_CH;
    dly.className = 'chap daily' + (dOpen ? '' : ' locked');
    dly.innerHTML = `<div class="img" style="background-image:url(${IMG[D.CHAPTERS[today % 8].bg]})"></div><i class="bar-top"></i>
      <span class="pc">${save.dailyDone === today ? '오늘 완료' : '참치 300 · 부품 1000'}</span>
      <div class="txt"><div class="no">DAILY OPERATION</div><div class="nm">일일 작전</div><div class="sb">매일 바뀌는 조건과 고정 편성 · 하루 한 번 보상</div></div>
      ${dOpen ? '' : '<div class="lock"><i></i><span>1장 클리어 후 개방</span></div>'}`;
    if (dOpen) dly.onclick = () => { AUDIO.play('click'); openDaily(today); };
    box.appendChild(dly);
    // the infinite front: after the normal campaign
    const inf = document.createElement('button');
    inf.className = 'chap infinite' + (normalDone() ? '' : ' locked');
    inf.innerHTML = `<div class="img" style="background-image:url(${IMG.bg_title})"></div><i class="bar-top"></i>
      <span class="pc">${save.infRun ? `도전 ${save.infRun}층 · ` : ''}최고 ${save.infBest}층</span>
      <div class="txt"><div class="no">INFINITE FRONT</div><div class="nm">무한 전장</div><div class="sb">층마다 강해지는 철충 · 새 기록마다 참치</div></div>
      ${normalDone() ? '' : '<div class="lock"><i></i><span>8-10 클리어 후 개방</span></div>'}`;
    if (normalDone()) inf.onclick = () => { AUDIO.play('click'); openInfinite(); };
    box.appendChild(inf);
  }

  function openDaily(day) {
    if (save.dailyDay !== day) { save.dailyDay = day; save.dailyTop = save.cleared; persist(); } // one stage for the whole day
    const st = D.dailyStage(day, save.dailyTop);
    const enemyIds = [...new Set(st.spawns.map((x) => x[0]))];
    const done = save.dailyDone === day;
    modal('일일 작전', `<div class="inf-info"><div><b>${st.name}</b> · 적 강도 ${Math.round(st.pow * 100)}%</div>
      ${st.mod ? `<div class="si-mod"><b>${D.MODS[st.mod].name}</b> ${D.MODS[st.mod].tip}</div>` : ''}
      <div class="si-enemies">${enemyIds.concat(st.boss ? [st.boss.e] : []).map((e) => enemyChip(e, st.boss && e === st.boss.e)).join('')}</div>
      <div class="si-label">고정 편성 (LV ${st.squadLv})</div>
      <div class="dsq">${st.squad.map((id) => `<span class="dsq-u r-${D.UNIT[id].rank}"><img src="${IMG['u_' + id]}" alt="">${rk(D.UNIT[id].rank)}</span>`).join('')}</div>
      <div class="si-rewards">${rwHtml(D.reward(st, done ? 'win' : 'first'))}</div>
      <div style="font-size:12px">${done ? '오늘 보상은 받았습니다 · 연습으로 다시 할 수 있습니다' : '하루 한 번 보상'}</div></div>`,
    [['출격', () => { closeModal(); launch(st); }], ['닫기', closeModal, 'd']]);
  }

  // the infinite front is a run: it starts at floor 1, buffs pile up floor by floor, a defeat ends it.
  // infBest is the record (new records pay tuna); infRun is the floor the current run stands on.
  function openInfinite() {
    const run = save.infRun || 0;
    const st = Object.assign(D.infiniteFloor(run + 1), { buffs: save.infBuffs || [] });
    const enemyIds = [...new Set(st.spawns.map((x) => x[0]))];
    const r = D.reward(st, st.floor > save.infBest ? 'first' : 'win');
    const have = buffList();
    modal(`무한 전장 ${st.floor}층`, `<div class="inf-info"><div>적 강도 <b>${Math.round(st.pow * 100)}%</b>${st.boss ? ` · 보스 <b>${D.ENEMIES[st.boss.e].name}</b>` : ''}</div>
      <div class="si-enemies">${enemyIds.concat(st.boss ? [st.boss.e] : []).map((e) => enemyChip(e, st.boss && e === st.boss.e)).join('')}</div>${traitNote(enemyIds)}
      <div class="si-rewards">${rwHtml(r)}</div>
      <div style="font-size:12px">${run ? `진행 중인 도전 ${run}층 돌파 · 강화 ${have || '없음'}` : '새 도전: 1층부터 시작'} · 최고 기록 ${save.infBest}층</div></div>`,
    [['출격', () => { closeModal(); launch(st); }],
      ...(run ? [['도전 포기', () => { save.infRun = 0; save.infBuffs = []; persist(); closeModal(); refresh(); }, 'o']] : []),
      ['닫기', closeModal, 'd']]);
  }
  const BUFF_MAX = 3; // one buff stacks at most this many times
  const BUFF_ICON = { atk: 'i_atk', hp: 'i_shield', money: 'i_resource', income: 'i_gear', cannon: 'i_fire', cd: 'set_speed' };
  const buffList = () => {
    const n = {};
    (save.infBuffs || []).forEach((id) => { n[id] = (n[id] || 0) + 1; });
    return Object.entries(n).map(([id, k]) => `${D.INF_BUFFS.find((b) => b.id === id).name}${k > 1 ? ' x' + k : ''}`).join(' · ');
  };
  // between floors: keep one of three buffs for this run (the choice cannot be dismissed)
  function pickBuff(floor) {
    const count = (id) => (save.infBuffs || []).filter((x) => x === id).length;
    const pool = shuffle(D.INF_BUFFS.filter((b) => count(b.id) < BUFF_MAX)).slice(0, 3);
    show('lobby');
    const go = () => launch(Object.assign(D.infiniteFloor(floor), { buffs: save.infBuffs || [] }));
    if (!pool.length) return go();
    modal(`무한 전장 ${floor}층 — 강화 선택`, `<div class="buffs">${pool.map((b, i) => `<button class="buff" data-i="${i}">
        <i style="background-image:var(--s-${BUFF_ICON[b.id]})"></i><b>${b.name}</b><span>${b.tip}</span><small>보유 ${count(b.id)}/${BUFF_MAX}</small></button>`).join('')}</div>
      ${buffList() ? `<div class="have">보유 강화: ${buffList()}</div>` : ''}`, [], true);
    lockModal = true;
    document.querySelectorAll('.buff').forEach((el) => {
      el.onclick = () => {
        AUDIO.play('levelup', 0.7);
        save.infBuffs = [...(save.infBuffs || []), pool[+el.dataset.i].id];
        persist(); lockModal = false; closeModal(); go();
      };
    });
  }

  // an enemy icon with its trait badges, and the stage's trait advice line
  const enemyChip = (e, boss) => `<div class="en${boss ? ' boss' : ''}"><img src="${IMG['e_' + e]}" alt="">${(D.ENEMIES[e].traits || []).map((t) => `<i class="tr ${t}" title="${D.TRAITS[t].tip}">${D.TRAITS[t].name}</i>`).join('')}${D.ENEMIES[e].name}</div>`;
  const traitNote = (ids) => {
    const ts = [...new Set(ids.filter(Boolean).flatMap((e) => D.ENEMIES[e].traits || []))];
    return ts.length ? `<div class="si-traits">${ts.map((t) => `<span><b class="tr ${t}">${D.TRAITS[t].name}</b> ${D.TRAITS[t].tip}</span>`).join('')}</div>` : '';
  };

  // reward chips: xp / parts / tuna
  const rwHtml = (r) => `<span class="rw xp"><i></i>${fmt(r.xp)}</span><span class="rw parts"><i></i>${fmt(r.parts)}</span>` + (r.tuna ? `<span class="rw tuna"><i></i>${fmt(r.tuna)}</span>` : '');

  // one chapter: the stage path and the selected stage's info
  function renderStages() {
    const c = chapterOpen, ch = D.CHAPTERS[c];
    $('chNo').textContent = `${isHard() ? 'HARD ' : ''}CHAPTER ${pad2(c + 1)}`;
    $('chTitle').textContent = ch.title;
    $('chSub').textContent = isHard() ? `${ch.sub} · 하드 모드` : `${ch.sub} · 클리어 보상 ${D.UNIT[D.CHAPTER_REWARD[c]].name}`;
    const sc = $('chStory');
    sc.innerHTML = '';
    if (!isHard()) [['intro', '도입'], ['elite', '중반'], ['boss', '결전'], ['outro', '결말']].forEach(([k, label]) => {
      const key = `c${c + 1}_${k}`;
      if (!save.seen[key]) return;
      const b = document.createElement('button');
      b.textContent = '▶ ' + label;
      b.onclick = () => playStory(key);
      sc.appendChild(b);
    });
    const first = ch.first, stages = list().slice(first, first + D.PER_CH), done = progress();
    if (selStage < first || selStage >= first + D.PER_CH) selStage = Math.min(Math.max(first, done), first + D.PER_CH - 1);
    const path = $('stagePath');
    path.innerHTML = '';
    path.classList.toggle('hard', isHard());
    const narrow = path.clientWidth < 560;
    const pos = stages.map((s, i) => narrow
      ? [i % 2 ? 70 : 30, 6 + i * 9.8]
      : [7 + i * (86 / (stages.length - 1)), i % 2 ? 68 : 32]);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    for (let i = 1; i < pos.length; i++) {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', pos[i - 1][0]); l.setAttribute('y1', pos[i - 1][1]);
      l.setAttribute('x2', pos[i][0]); l.setAttribute('y2', pos[i][1]);
      const open = first + i <= done;
      l.setAttribute('stroke', open ? (isHard() ? '#ff4a3a' : '#ffcc00') : 'rgba(255,255,255,0.18)');
      l.setAttribute('stroke-width', open ? '3' : '2');
      l.setAttribute('vector-effect', 'non-scaling-stroke');
      if (!open) l.setAttribute('stroke-dasharray', '6 6');
      svg.appendChild(l);
    }
    path.appendChild(svg);
    stages.forEach((s, i) => {
      const locked = s.ix > done;
      const stars = starsOf(s);
      const n = document.createElement('button');
      n.dataset.ix = s.ix;
      n.className = 'node' + (locked ? ' locked' : ' open') + (s.ix === done ? ' cur' : '') + (s.last ? ' boss' : '') + (s.ix === selStage ? ' sel' : '');
      n.style.left = pos[i][0] + '%';
      n.style.top = pos[i][1] + '%';
      n.innerHTML = (s.last ? '<span class="tag">BOSS</span>' : s.elite ? '<span class="tag elite">정예</span>' : s.mod ? `<span class="tag mod">${D.MODS[s.mod].name}</span>` : '') +
        `<span class="code">${s.code}</span><span class="stars">${[0, 1, 2].map((k) => `<i class="${k < stars ? 'on' : ''}"></i>`).join('')}</span>` +
        (!isHard() && storyBefore(s) && !save.seen[storyBefore(s)] && !locked ? '<i class="story-dot"></i>' : '');
      if (!locked) n.onclick = () => { AUDIO.play('click', 0.5, 1.15); selStage = s.ix; sheetOpen = true; renderStages(); };
      path.appendChild(n);
    });
    renderStageInfo(list()[selStage]);
    $('stageInfo').classList.toggle('open', sheetOpen);
    path.classList.toggle('sheet-off', !sheetOpen);
    path.onclick = (e) => { if (sheetOpen && !e.target.closest('.node')) { sheetOpen = false; renderStages(); } }; // tap the map: close
  }

  function renderStageInfo(s) {
    const box = $('stageInfo');
    const first = s.ix >= progress();
    const enemyIds = [...new Set(s.spawns.map((x) => x[0]))];
    const boss = s.boss && s.boss.e;
    const unit = !s.hard && s.last && D.UNIT[D.CHAPTER_REWARD[s.chapter]];
    const stars = starsOf(s);
    box.innerHTML = `<div class="si-head"><div class="si-code">${s.code}</div><div class="si-name">${s.name}</div>
        <div class="si-type">${s.last ? '챕터 보스 작전' : s.elite ? '정예 개체 출현' : '일반 작전'} · 적 강도 ${Math.round(s.pow * 100)}%</div>
        ${s.mod ? `<div class="si-mod"><b>${D.MODS[s.mod].name}</b> ${D.MODS[s.mod].tip}</div>` : ''}</div>
      <div class="si-stars">${[0, 1, 2].map((k) => `<i class="${k < stars ? 'on' : ''}"></i>`).join('')}<small>6분 내 ★2 · +기지 80% ★3 · 제한 10분</small></div>
      <div class="si-label">출현 철충</div>
      <div class="si-enemies">${(boss ? [boss] : []).concat(enemyIds.filter((e) => e !== boss)).map((e) => enemyChip(e, e === boss)).join('')}</div>
      ${traitNote([boss, ...enemyIds])}
      <div class="si-label">${first ? '첫 클리어 보상' : '반복 보상'}</div>
      <div class="si-rewards">${rwHtml(D.reward(s, first ? 'first' : 'win'))}
        ${unit && first && !owned(unit.id) ? `<span class="rw unit"><img src="${IMG['u_' + unit.id]}" alt="">${rk(unit.rank)} ${unit.name} 합류</span>` : ''}</div>
      <div class="si-go"><button class="btn lg${s.hard ? ' o' : ''}" id="btnGo">출격</button></div>
      <button class="si-close" id="siClose" aria-label="닫기"></button>`;
    $('siClose').onclick = () => { AUDIO.play('click', 0.4, 0.8); sheetOpen = false; renderStages(); };
    $('btnGo').onclick = () => { AUDIO.play('click', 1, 0.78); startStage(s); };
  }

  // story before a normal stage: the chapter's intro (x-1), elite (x-5) or boss (x-10) scene
  function storyBefore(s) {
    if (s.hard || s.infinite) return null;
    const c = s.chapter + 1;
    if (s.no === 1) return `c${c}_intro`;
    if (s.elite) return `c${c}_elite`;
    if (s.last) return `c${c}_boss`;
    return null;
  }

  function startStage(s) {
    if (lobbyTut() && !s.hard && s.ix === 1) finishTutorial(); // reaching 1-2 completes the tutorial
    const key = storyBefore(s);
    // 설정 > 스토리 다시 보기: on, every stage story plays each time; off, only the ones never seen
    if (key && (!save.seen[key] || save.storyAlways)) playStory(key, () => launch(s));
    else launch(s);
  }

  // ── story player ───────────────────────────────────────
  let story = null;
  function playStory(key, done) {
    const sc = STORY.S[key];
    if (!sc) { if (done) done(); return; }
    story = { key, sc, i: -1, done, typing: null, side: 'L', slots: { L: null, R: null } };
    AUDIO.music(sc.bgm || (key === 'c8_outro' ? 'ending' : /_boss$/.test(key) ? 'thrill' : /_outro$/.test(key) ? 'talk2' : 'talk'));
    $('stBg').style.backgroundImage = `url(${IMG[sc.bg] || IMG.bg_title})`;
    ['stL', 'stR'].forEach((id) => { $(id).className = 'st-char ' + id.slice(2); $(id).removeAttribute('src'); });
    $('story').classList.add('show');
    nextLine();
  }

  // story expressions: where the illustration has a matching face set (js/faces.js), the face changes with the line's mood
  const MOODS = [
    ['angry', /(용서|젠장|감히|망쳐|이놈|비켜|화가|으윽|당장)/, ['Anger', 'Anger2', 'Serious', 'Resolve']],
    ['surprised', /(\?!|!\?|뭐라고|설마|어떻게|놀라|저게 뭐|왜 여기)/, ['Surprised', 'Question', 'What', 'Exiting']],
    ['sad', /(^…|미안|슬퍼|울어|돌아오지|잃|못 했|아파|힘들)/, ['Sad', 'Worry', 'CloseEye', 'Apologize']],
    ['shy', /(부끄|칭찬|쑥스|꽤 잘했|어땠어요)/, ['Shy', 'Embarrass', 'Smile']],
    ['happy', /(좋아|고마|다행|최고|하하|헤헤|잘했|축하|기뻐|간단하네|놀이터)/, ['BigSmile', 'Happy', 'Smile', 'Smile2']],
    ['serious', /(집중|조심|경계|명심|확인해|맡는다|버틴다|각오)/, ['Serious', 'Resolve', 'Blunt', 'Idle']],
    // otherwise the punctuation: a question, a trailing-off line, an exclamation
    ['ask', /\?/, ['Question', 'Surprised', 'What']],
    ['trail', /…/, ['CloseEye', 'Worry', 'Sad', 'eyeshalf']],
    ['exclaim', /!/, ['Resolve', 'Serious']],
  ];
  function faceFor(who, text, stage) {
    const f = window.FACES && FACES[who];
    if (!f || !hasFull(who)) return null;
    if (stage && stage.face) return f.e[stage.face] ? stage.face : null;
    for (const [, re, list] of MOODS) if (re.test(text)) { const e = list.find((x) => f.e[x]); if (e) return e; }
    return f.e.Idle ? 'Idle' : null;
  }
  const faceCache = {};
  // the illustration with the face pasted in, drawn once per (character, expression)
  function faceArt(who, ex) {
    const key = who + '/' + ex;
    if (faceCache[key]) return faceCache[key];
    faceCache[key] = new Promise((res) => {
      const f = FACES[who], a = new Image(), b = new Image();
      let n = 0;
      const go = () => {
        if (++n < 2) return;
        try {
          const c = document.createElement('canvas');
          c.width = a.naturalWidth; c.height = a.naturalHeight;
          const g = c.getContext('2d');
          g.drawImage(a, 0, 0);
          g.drawImage(b, f.x * c.width, f.y * c.height, f.w * c.width, f.h * c.height);
          res(c.toDataURL('image/webp', 0.9));
        } catch (e) { res(null); }
      };
      a.onload = b.onload = go; a.onerror = b.onerror = () => res(null);
      a.src = FULL[who]; b.src = f.e[ex];
    });
    return faceCache[key];
  }
  function setFace(el, who, ex) {
    el.dataset.face = ex || '';
    if (!ex) return;
    faceArt(who, ex).then((url) => { if (url && el.dataset.face === ex && story && story.slots[el.id.slice(2)] === who) el.src = url; });
  }

  function nextLine() {
    const st = story;
    if (!st) return;
    if (st.typing) { clearInterval(st.typing); st.typing = null; $('stText').textContent = st.full; return; } // finish the line first
    st.i++;
    if (st.i >= st.sc.lines.length) return endStory();
    const [who, text, sideArg, stage] = st.sc.lines[st.i];
    if (stage) { // staging cues: screen shake / white flash / a sound
      if (stage.sfx) AUDIO.play(stage.sfx, 0.8);
      if (stage.fx) { const box = $('story'); box.classList.remove('fx-shake', 'fx-flash'); void box.offsetWidth; box.classList.add('fx-' + stage.fx); }
    }
    const unit = D.UNIT[who];
    const name = unit ? unit.name : STORY.NAMES[who] != null ? STORY.NAMES[who] : who;
    $('stName').textContent = name;
    const tx = $('stText');
    tx.className = 'st-text' + (who === 'sys' ? ' sys' : who === 'radio' ? ' radio' : '');
    if (unit) {
      let side = sideArg || (st.slots.L === who ? 'L' : st.slots.R === who ? 'R' : st.side);
      const was = side === 'L' ? 'R' : 'L';
      if (st.slots[was] === who) { // moving to the other side: leave the old one (never the same character twice)
        st.slots[was] = null;
        const old = $('st' + was);
        old.classList.remove('show', 'talk', 'enter');
        old.removeAttribute('src'); old.dataset.face = '';
      }
      const el = $('st' + side);
      if (st.slots[side] !== who) {
        st.slots[side] = who;
        el.src = art(who);
        el.dataset.face = '';
        el.classList.toggle('portrait', !hasFull(who));
        el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); // slides in
      }
      const ex = faceFor(who, text, stage);
      if (ex !== (el.dataset.face || null)) setFace(el, who, ex);
      el.classList.add('show');
      el.classList.remove('dim');
      el.classList.remove('talk'); void el.offsetWidth; el.classList.add('talk'); // a little hop as they speak
      const other = $('st' + (side === 'L' ? 'R' : 'L'));
      other.classList.add('dim');
      st.side = side === 'L' ? 'R' : 'L';
    } else {
      ['stL', 'stR'].forEach((id) => $(id).classList.add('dim'));
      if (who === 'sys') ['stL', 'stR'].forEach((id) => $(id).classList.remove('show'));
      if (who === 'sys') st.slots = { L: null, R: null };
    }
    st.full = text;
    let k = 0;
    tx.textContent = '';
    const step = who === 'sys' ? 1 : 2; // narration reads slower
    st.typing = setInterval(() => {
      k += step;
      tx.textContent = text.slice(0, k);
      if (k >= text.length) { clearInterval(st.typing); st.typing = null; }
    }, 28);
  }

  function endStory() {
    const st = story;
    if (!st) return;
    if (st.typing) clearInterval(st.typing);
    story = null;
    $('story').classList.remove('show');
    // seen once it has been read to the end (or skipped on purpose): leaving the game mid-scene plays it again next time
    save.seen[st.key] = 1;
    persist();
    if (st.sc === STORY.S.c8_outro && !st.skipped) return credits(st.done);
    if (st.done) st.done();
    else if ($('lobby').classList.contains('show')) { AUDIO.music('lobby'); refresh(); }
  }
  $('stBox').onclick = nextLine;
  $('story').addEventListener('pointerdown', (e) => { if (e.target === $('story') || e.target.classList.contains('st-bg') || e.target.classList.contains('st-char')) nextLine(); });
  $('stSkip').onclick = (e) => { e.stopPropagation(); if (story) story.skipped = true; endStory(); };

  // after a chapter's last scene: CHAPTER CLEAR over the chapter's art, with the unit who joined
  function titleCard(c, done) {
    const ch = D.CHAPTERS[c], id = D.CHAPTER_REWARD[c];
    const el = $('credits');
    el.innerHTML = `<div class="tcard" style="background-image:url(${IMG[ch.bg]})">${hasFull(id) ? `<img src="${FULL[id]}" alt="">` : ''}
      <div class="tc-txt"><div class="tc-no">CHAPTER ${pad2(c + 1)}</div><div class="tc-t">${ch.title}</div><div class="tc-clear">CLEAR</div></div></div>`;
    el.classList.add('show');
    AUDIO.play('clear', 0.8);
    const close = () => { el.classList.remove('show'); el.onclick = null; if (done) done(); };
    el.onclick = close;
    setTimeout(() => { if (el.classList.contains('show')) close(); }, 3200);
  }

  // the ending: credits over the final battlefield
  function credits(done) {
    const el = $('credits');
    el.innerHTML = `<div class="cr-roll"><img src="${UIA.logo.u}" alt=""><h2>WAR GENESIS</h2>
      <p>작전 「워 제네시스」 완료</p>
      <h3>원작 리소스</h3><p>라스트오리진 — SD 캐릭터 · 일러스트 · UI · 이펙트 · 사운드</p>
      <h3>오르카 전선</h3><p>${D.UNITS.map((u) => u.name).join(' · ')}</p>
      <h3>철충</h3><p>${Object.values(D.ENEMIES).map((e) => e.name).join(' · ')}</p>
      <h3>그리고</h3><p>끝까지 지휘해 준 사령관에게</p>
      <p class="end">— THANK YOU FOR PLAYING —</p><p>하드 모드와 무한 전장이 열렸습니다.</p></div>`;
    el.classList.add('show');
    AUDIO.music('ending');
    const close = () => { el.classList.remove('show'); el.onclick = null; if (done) done(); };
    el.onclick = close;
    setTimeout(() => { if (el.classList.contains('show')) close(); }, 32000);
  }
  addEventListener('keydown', (e) => {
    if (!story) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); nextLine(); }
    if (e.key === 'Escape') endStory();
  });

  // squad: the formation bar (slots and cost) and every unit (owned ones bright)
  let filter = 'ALL';
  // a card in the 덱 구성 style: rank frame, 전력 cost, level, the XP towards the next level
  function crCard(u, onClick) {
    const have = owned(u.id), inDeck = save.deck.includes(u.id), lv = have ? lvOf(u.id) : D.START_LV[u.rank];
    const need = lv < D.MAX_LV ? D.cardsNeed(u.rank, lv) : 0, n = cardsOf(u.id), prog = need ? Math.min(1, n / need) : 1;
    const ready = have && need && n >= need && save.xp >= D.xpNeed(u.rank, lv);
    const b = document.createElement('button');
    b.className = `crc r-${u.rank}` + (have ? '' : ' none') + (inDeck ? ' in' : '') + (ready ? ' up' : '') + (have && need && n >= need ? ' full' : '');
    b.dataset.id = u.id;
    b.innerHTML = `<div class="crc-art"><img src="${IMG['u_' + u.id]}" alt="" draggable="false"><i class="crc-cost">${u.cost}</i>${rk(u.rank)}` +
      `</div>` +
      `<div class="crc-lv">${have ? `레벨 ${lv}` : '미보유'}</div>` +
      (have ? `<div class="crc-xp"><i style="width:${prog * 100}%"></i><span>${need ? `${fmt(n)}/${fmt(need)}` : 'MAX'}</span></div>` : `<div class="crc-xp crc-name">${u.name}</div>`);
    b.title = `${u.name} (${u.rank} · 편성 코스트 ${D.DECK_COST[u.rank]})`;
    b.onclick = onClick;
    return b;
  }
  function renderSquad() {
    const cost = deckCost(save.deck);
    // presets
    const tabs = $('deckTabs');
    tabs.innerHTML = [0, 1, 2].map((k) => `<button class="${k === save.deckIx ? 'on' : ''}" data-k="${k}">${k + 1}</button>`).join('');
    tabs.querySelectorAll('button').forEach((b) => { b.onclick = () => {
      const k = +b.dataset.k;
      if (k === save.deckIx) return;
      save.decks[save.deckIx] = save.deck.slice();
      save.deckIx = k;
      save.deck = save.decks[k].length ? save.decks[k].slice() : autoDeck();
      persist(); AUDIO.play('click', 0.5, 1.35); renderSquad();
    }; });
    // the deck: ten cards, five a row
    const grid = $('deckEdit');
    grid.innerHTML = '';
    for (let i = 0; i < DECK_MAX; i++) {
      const id = save.deck[i];
      if (id) { const c = crCard(D.UNIT[id], () => (swapIn ? swapInto(i) : cardMenu(D.UNIT[id], c))); if (swapIn) c.classList.add('swap-target'); c.dataset.slot = i; grid.appendChild(c); }
      else { // the same frame as a card (art / level / bar), so the grid never changes height
        const e = document.createElement('div'); e.className = 'crc empty';
        e.dataset.slot = i;
        e.innerHTML = '<div class="crc-art"><i>+</i></div><div class="crc-lv">&nbsp;</div><div class="crc-xp ghost"></div>'; grid.appendChild(e);
      }
    }
    const avg = save.deck.length ? Math.round(save.deck.reduce((a, id) => a + D.UNIT[id].cost, 0) / save.deck.length) : 0;
    $('deckAvg').innerHTML = `<i class="pw"></i>평균 전력 <b>${avg}</b>`;
    $('deckCount').innerHTML = `${save.deck.length}/${DECK_MAX} · 편성 코스트 <em class="${cost > D.DECK_CAP - 3 ? 'hi' : ''}">${cost}/${D.DECK_CAP}</em>`;
    // synergies: a small button; the full list opens on demand
    const on = D.synergiesOf(save.deck.map((id) => D.UNIT[id]));
    $('synBtn').innerHTML = `시너지 <b>${on.length}</b> ›`;
    $('synBtn').onclick = () => { AUDIO.play('click', 0.5); openSynergies(); };
    // the collection
    const fl = $('rankFilter');
    const have = D.UNITS.filter((u) => owned(u.id)).length;
    fl.innerHTML = ['ALL', ...D.RANK_ORDER].map((r) => `<button data-r="${r}" class="${filter === r ? 'on' : ''}">${r === 'ALL' ? '전체' : rk(r) + r}</button>`).join('') +
      `<span class="count">보유 ${have} / ${D.UNITS.length} · XP ${fmt(save.xp)} · 와일드카드 ${D.RANK_ORDER.map((r) => `<i class="wild-i r-${r}">${r}</i>${fmt(save.wild[r])}`).join(' ')}</span>`;
    fl.querySelectorAll('button').forEach((b) => { b.onclick = () => { filter = b.dataset.r; renderSquad(); }; });
    const box = $('squadList');
    box.innerHTML = '';
    D.UNITS.filter((u) => (filter === 'ALL' || u.rank === filter) && !save.deck.includes(u.id)) // deck cards live only in the deck (Clash Royale)
      .sort((a, b) => (owned(b.id) - owned(a.id)) || (rankIx(b) - rankIx(a)) || (a.cost - b.cost))
      .forEach((u) => { const c = crCard(u, () => cardMenu(u, c)); box.appendChild(c); });
  }
  // Clash Royale-style card menu: right under the tapped card, over the layout (nothing moves)
  //  not in the deck: 정보 / 사용     in the deck: 정보 / 제거     upgradable: 업그레이드 (XP) / 사용 or 제거
  let swapIn = null; // a card waiting for a deck slot to replace (the deck was full)
  function closeCardMenu() {
    const m = $('cardMenu'); m.classList.remove('show'); m.innerHTML = '';
    document.querySelectorAll('.crc.sel').forEach((e) => e.classList.remove('sel'));
  }
  function cardMenu(u, el) {
    const m = $('cardMenu');
    if (m.classList.contains('show') && m.dataset.id === u.id) return closeCardMenu();
    closeCardMenu();
    AUDIO.play('click', 0.45, 1.2);
    const have = owned(u.id), inDeck = save.deck.includes(u.id), lv = have ? lvOf(u.id) : 0;
    const need = have && lv < D.MAX_LV ? D.cardsNeed(u.rank, lv) : 0, cost = have ? D.xpNeed(u.rank, lv) : 0;
    const upgradable = have && need && cardsOf(u.id) >= need; // enough copies: the button shows even when XP is short (cost in red)
    const btns = [];
    if (upgradable) btns.push(['up', `<b>업그레이드</b><small class="${save.xp < cost ? 'short' : ''}"><i class="xp-i"></i>${fmt(cost)}</small>`]);
    else btns.push(['info', '<b>정보</b>']);
    if (have) btns.push(inDeck ? ['remove', '<b>제거</b>'] : ['use', '<b>사용</b>']);
    m.innerHTML = btns.map(([k, h]) => `<button class="cm-${k}" data-k="${k}">${h}</button>`).join('');
    m.dataset.id = u.id;
    m.querySelectorAll('button').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); cardAction(u, b.dataset.k); }; });
    el.classList.add('sel');
    // place it under the card (above it when the card is near the bottom)
    const r = el.getBoundingClientRect();
    m.style.width = Math.max(96, r.width + 16) + 'px';
    m.classList.add('show');
    const h = m.offsetHeight, below = r.bottom + h + 8 < innerHeight - 70;
    const left = Math.max(6, Math.min(innerWidth - m.offsetWidth - 6, r.left + r.width / 2 - m.offsetWidth / 2));
    m.style.left = left + 'px';
    m.style.setProperty('--ax', r.left + r.width / 2 - left + 'px'); // the arrow points at the card even when the menu is pushed in
    m.style.top = (below ? r.bottom + 4 : r.top - h - 4) + 'px';
    m.classList.toggle('above', !below);
  }
  function cardAction(u, k) {
    if (k === 'info') { closeCardMenu(); return openDetail(u); }
    if (k === 'up') {
      const lv = lvOf(u.id), need = D.cardsNeed(u.rank, lv), cost = D.xpNeed(u.rank, lv);
      if (cardsOf(u.id) < need) return GAME.toast('카드가 부족합니다');
      if (save.xp < cost) return GAME.toast(`XP가 부족합니다 (${fmt(save.xp)} / ${fmt(cost)})`);
      save.xp -= cost; save.cards[u.id] = cardsOf(u.id) - need; save.lv[u.id] = lv + 1; persist();
      AUDIO.play('levelup'); closeCardMenu(); refresh();
      GAME.toast(`${u.name} 레벨 ${lv + 1}!`);
      return;
    }
    if (k === 'remove') {
      if (save.deck.length <= 1) return GAME.toast('최소 1명은 편성해야 합니다');
      save.deck = save.deck.filter((x) => x !== u.id); persist();
      AUDIO.play('click', 0.45, 0.7); closeCardMenu(); renderSquad();
      return;
    }
    if (k === 'use') {
      closeCardMenu();
      if (save.deck.length < DECK_MAX && fits(u.id)) { save.deck.push(u.id); persist(); AUDIO.play('click', 0.5, 1.1); renderSquad(); return; }
      // the deck is full (or over its cost): pick the card to replace
      swapIn = u.id; renderSquad();
      $('deckEdit').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      GAME.toast(`교체할 덱 카드를 고르세요 (${u.name})`);
    }
  }
  function swapInto(i) {
    const id = swapIn, out = save.deck[i];
    const next = save.deck.slice(); next[i] = id;
    if (deckCost(next) > D.DECK_CAP) return GAME.toast(`편성 코스트 초과 (${deckCost(next)} > ${D.DECK_CAP})`);
    save.deck = next; swapIn = null; persist();
    AUDIO.play('click', 0.5, 1.1); renderSquad();
    GAME.toast(`${D.UNIT[out].name} → ${D.UNIT[id].name}`);
  }
  // a tap anywhere else closes the menu / leaves the replace mode
  addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if ($('cardMenu').classList.contains('show') && !t.closest('#cardMenu, .crc')) closeCardMenu();
    if (swapIn && !t.closest('#deckEdit .crc')) { swapIn = null; renderSquad(); }
  }, true);
  document.addEventListener('scroll', () => closeCardMenu(), true);

  // drag and drop: a deck card onto another slot moves / swaps it, onto the collection removes it;
  // a collection card onto a deck slot adds it (empty slot) or replaces that card.
  // Hold a moment (or, with a mouse, just drag) to pick a card up (a quick swipe still scrolls).
  const drag = { el: null, ghost: null, id: null, from: -1, x0: 0, y0: 0, timer: 0, on: false, hover: null, eaten: false };
  function dragEnd() {
    clearTimeout(drag.timer);
    if (drag.ghost) drag.ghost.remove();
    if (drag.el) drag.el.classList.remove('dragging');
    if (drag.hover) drag.hover.classList.remove('drop-hover');
    document.body.classList.remove('carddrag');
    Object.assign(drag, { el: null, ghost: null, id: null, from: -1, on: false, hover: null });
  }
  function dragStart() {
    drag.on = true; drag.eaten = true;
    closeCardMenu(); swapIn = null;
    const r = drag.el.getBoundingClientRect(), g = drag.el.cloneNode(true);
    g.classList.add('drag-ghost'); g.classList.remove('sel');
    Object.assign(g.style, { width: r.width + 'px', height: r.height + 'px' });
    drag.ox = drag.x0 - r.left; drag.oy = drag.y0 - r.top;
    document.body.appendChild(g); drag.ghost = g;
    g.style.transform = `translate(${r.left}px, ${r.top}px) rotate(-4deg) scale(1.06)`;
    drag.el.classList.add('dragging'); document.body.classList.add('carddrag');
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { /* ignore */ }
    AUDIO.play('click', 0.4, 1.4);
  }
  function dropTarget(x, y) {
    const t = document.elementFromPoint(x, y);
    if (!t) return null;
    const slot = t.closest('#deckEdit .crc');
    if (slot) return slot;
    if (drag.from >= 0 && t.closest('#squadList, .cr-sec, #rankFilter')) return $('squadList'); // remove from the deck
    return null;
  }
  function dropOn(tg) {
    const deck = save.deck.slice(), id = drag.id;
    if (tg.id === 'squadList') { // deck card back to the collection
      if (deck.length <= 1) return GAME.toast('최소 1명은 편성해야 합니다');
      save.deck = deck.filter((x) => x !== id);
    } else {
      const j = +tg.dataset.slot, at = deck[j];
      if (drag.from >= 0) { // deck → deck: swap places, or move to the end
        if (j === drag.from) return;
        if (at) { deck[j] = id; deck[drag.from] = at; } else { deck.splice(drag.from, 1); deck.push(id); }
      } else if (deck.includes(id)) { // a deck member dragged from the collection: swap places with that slot
        const k = deck.indexOf(id);
        if (!at || k === j) return;
        deck[j] = id; deck[k] = at;
      } else if (at) { // replace
        deck[j] = id;
      } else { // add
        if (deck.length >= DECK_MAX) return;
        deck.push(id);
      }
      if (deckCost(deck) > D.DECK_CAP) return GAME.toast(`편성 코스트 초과 (${deckCost(deck)} > ${D.DECK_CAP})`);
      save.deck = deck;
    }
    persist(); AUDIO.play('click', 0.5, 1.1);
  }
  addEventListener('pointerdown', (e) => {
    drag.eaten = false; // a drag that ended without a click must not eat this tap's click
    if (e.button > 0 || lobbyTut() || drag.el) return;
    const c = e.target instanceof Element && e.target.closest('#deckEdit .crc:not(.empty), #squadList .crc:not(.none)');
    if (!c) return;
    Object.assign(drag, { el: c, id: c.dataset.id, from: c.dataset.slot != null ? +c.dataset.slot : -1, x0: e.clientX, y0: e.clientY, pid: e.pointerId, touch: e.pointerType !== 'mouse', eaten: false });
    drag.timer = setTimeout(() => { if (drag.el && !drag.on) dragStart(); }, 260); // a hold picks the card up right away
  });
  addEventListener('pointermove', (e) => {
    if (!drag.el || e.pointerId !== drag.pid) return;
    if (!drag.on) {
      const d = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
      if (drag.touch) { if (d > 10) dragEnd(); return; } // moved before the hold: it is a scroll
      if (d < 6) return;
      clearTimeout(drag.timer); dragStart();
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.ox}px, ${e.clientY - drag.oy}px) rotate(-4deg) scale(1.06)`;
    const tg = dropTarget(e.clientX, e.clientY);
    if (tg !== drag.hover) {
      if (drag.hover) drag.hover.classList.remove('drop-hover');
      drag.hover = tg; if (tg && tg !== drag.el) tg.classList.add('drop-hover');
    }
  });
  addEventListener('pointerup', (e) => {
    if (!drag.el || e.pointerId !== drag.pid) return;
    const was = drag.on, tg = was && dropTarget(e.clientX, e.clientY);
    if (tg && tg !== drag.el) dropOn(tg);
    dragEnd();
    if (was) renderSquad();
  });
  addEventListener('pointercancel', () => { if (drag.el) { const was = drag.on; dragEnd(); if (was) renderSquad(); } });
  // while dragging: no page scroll, no long-press menu, and the click that ends a drag opens nothing
  addEventListener('touchmove', (e) => { if (drag.on) e.preventDefault(); }, { passive: false });
  addEventListener('contextmenu', (e) => { if (drag.el) e.preventDefault(); });
  addEventListener('click', (e) => { if (drag.eaten) { drag.eaten = false; e.stopPropagation(); e.preventDefault(); } }, true);

  function openSynergies() {
    const on = new Set(D.synergiesOf(save.deck.map((id) => D.UNIT[id])));
    modal('편성 시너지', `<div class="syn" style="margin:0">` +
      ['유형', '인연', '각오'].map((k) => `<div class="sy-k">${k}</div>` +
        D.SYNERGIES.filter((sy) => sy.kind === k).map((sy) => `<div class="sy${on.has(sy.id) ? ' on' : ''}${sy.kind === '각오' ? ' vow' : ''}"><i></i><b>${sy.name}</b><span>${sy.need}</span><small>${sy.tip}</small></div>`).join('')).join('') +
      `</div>`, [['닫기', closeModal, 'd']], true);
  }

  function unitCard(u, onClick, price) {
    const have = owned(u.id), inDeck = save.deck.includes(u.id);
    const b = document.createElement('button');
    b.className = `ucard r-${u.rank}` + (have ? '' : ' none') + (inDeck && !price ? ' in' : '');
    b.dataset.id = u.id;
    b.innerHTML = `<img src="${IMG['u_' + u.id]}" alt="">${rk(u.rank)}${have ? `<span class="lv">LV.${lvOf(u.id)}</span>` : ''}` +
      (inDeck && !price ? '<span class="tag">편성</span>' : '') +
      `<div class="nm">${u.name}</div>` + (price ? `<div class="price"><i class="tuna-i"></i>${fmt(price)}</div>` : '');
    b.onclick = onClick;
    return b;
  }

  function howToGet(u) {
    if (u.unlock === 0) return '처음부터 합류';
    if (u.unlock > 0) return `CHAPTER ${pad2(u.unlock)} 클리어 보상 · 제조 · 확정 영입`;
    return '제조 · 확정 영입으로 합류 (SS)';
  }

  function openDetail(u) {
    const have = owned(u.id);
    const lv = have ? lvOf(u.id) : D.START_LV[u.rank], m = D.lvMul(D.relLv(u.rank, lv)), cost = D.xpNeed(u.rank, lv);
    const need = lv < D.MAX_LV ? D.cardsNeed(u.rank, lv) : 0, n = cardsOf(u.id), short = Math.max(0, need - n);
    const inDeck = save.deck.includes(u.id);
    const fx = u.slow ? (u.slow[0] >= 1 ? ` · 맞은 적 ${u.slow[1]}초 기절` : ` · 맞은 적 ${Math.round(u.slow[0] * 100)}% 둔화`) : '';
    const body = `<div class="detail"><img class="art${hasFull(u.id) ? '' : ' portrait'}" src="${art(u.id)}" alt="" style="${have ? '' : 'filter:brightness(0.12) grayscale(1)'}">
      <div class="stats"><div class="nm">${rk(u.rank)}${u.name} ${have ? `<small>LV.${lv}</small>` : ''}</div>
      <div class="role">${u.role}${u.area ? ' · 범위' : ' · 단일'}${fx} · 편성 코스트 ${D.DECK_COST[u.rank]}</div>
      <div class="utr">${u.range < 2.4 ? '<span class="no">대공 불가</span>' : '<span>대공 가능</span>'}${u.type === 'snipe' ? '<span>장갑 관통 x1.5</span>' : u.area ? '<span class="no">장갑에 50%</span>' : ''}</div>
      <div>${have ? u.desc : howToGet(u)}</div>
      ${have ? `<div class="card-row"><span>카드</span><div class="crc-xp"><i style="width:${need ? Math.min(100, (n / need) * 100) : 100}%"></i><span>${need ? `${fmt(n)}/${fmt(need)}` : 'MAX'}</span></div>${short && save.wild[u.rank] ? `<small>${u.rank} 와일드카드 ${fmt(save.wild[u.rank])}장 보유</small>` : ''}</div>` : ''}
      <div class="stat-grid"><span>비용 <b>${u.cost}</b></span><span>재배치 <b>${u.cd}s</b></span>
      <span>체력 <b>${fmt(u.hp * m)}</b></span><span>공격 <b>${fmt(u.atk * m)}</b></span>
      <span>사거리 <b>${u.range}</b></span><span>이동 <b>${u.spd}</b></span>
      <span>넉백 <b>${u.kb}회</b></span><span>${u.skill ? `스킬 <b>${u.skill}타</b>` : ''}</span></div>
      ${have && lv < D.MAX_LV ? `<div style="margin-top:6px">업그레이드 → 레벨 ${lv + 1}: 카드 <b>${fmt(need)}</b> · <b>${fmt(cost)} XP</b> (보유 ${fmt(save.xp)})</div>` : have ? '<div style="margin-top:6px">최대 레벨</div>' : ''}</div></div>`;
    const btns = [];
    if (have) {
      if (lv < D.MAX_LV) btns.push([`업그레이드`, () => {
        if (n < need) return GAME.toast(`카드가 ${fmt(need - n)}장 부족합니다`);
        if (save.xp < cost) return GAME.toast('XP가 부족합니다');
        save.xp -= cost; save.cards[u.id] = n - need; save.lv[u.id] = lv + 1; persist();
        AUDIO.play('levelup'); refresh(); openDetail(u);
      }, n >= need && save.xp >= cost ? '' : 'd']);
      // wild cards stand in for the missing copies
      if (short && save.wild[u.rank]) btns.push([`와일드카드 ${fmt(Math.min(short, save.wild[u.rank]))}장 사용`, () => {
        const k = Math.min(short, save.wild[u.rank]);
        save.wild[u.rank] -= k; save.cards[u.id] = n + k; persist();
        AUDIO.play('purchase'); refresh(); openDetail(u);
      }, 'b']);
      btns.push([inDeck ? '편성 해제' : '편성', () => {
        if (inDeck) { if (save.deck.length <= 1) return GAME.toast('최소 1명은 편성해야 합니다'); save.deck = save.deck.filter((x) => x !== u.id); }
        else if (save.deck.length >= DECK_MAX) return GAME.toast('편성 칸을 눌러 대원을 먼저 빼 주세요');
        else if (!fits(u.id)) return GAME.toast(`편성 코스트 초과 (${deckCost(save.deck)} + ${D.DECK_COST[u.rank]} > ${D.DECK_CAP})`);
        else save.deck.push(u.id);
        persist(); closeModal(); renderSquad();
      }, inDeck ? 'd' : 'b']);
    }
    btns.push(['닫기', closeModal, 'd']);
    modal('', body, btns, true);
    if (have && window.VOICE && VOICE[u.id]) AUDIO.voice(VOICE[u.id]);
  }

  // a unit obtained again: one more core link, past full link it becomes XP. Returns { isNew, link, xp }
  // a card from the making / shop: new → it joins; owned → copies of it (qty, by default a pull's bundle)
  function obtain(u, keepOut, qty) {
    if (grant(u.id, keepOut)) return { isNew: true, cards: 0 };
    const [lo, hi] = D.PULL_CARDS[u.rank];
    const n = qty || lo + Math.floor(Math.random() * (hi - lo + 1));
    save.cards[u.id] = cardsOf(u.id) + n;
    return { isNew: false, cards: n };
  }

  // ── making (gacha, parts) and recruit shop (tuna) ──────
  const G_ = D.GACHA;
  const SS = D.UNITS.filter((u) => u.rank === 'SS');
  const FEATURABLE = SS.filter((u) => window.FULL && FULL[u.id]); // the banner needs a full-body illustration
  const featured = () => FEATURABLE[Math.floor(Date.now() / 86400000) % FEATURABLE.length]; // changes daily
  let gtab = 'making';
  document.querySelectorAll('.gtab').forEach((b) => { b.onclick = () => { gtab = b.dataset.g; AUDIO.play('click', 0.5, 1.35); renderGacha(); }; });

  function renderGacha() {
    document.querySelectorAll('.gtab').forEach((b) => b.classList.toggle('on', b.dataset.g === gtab));
    $('gMaking').style.display = gtab === 'making' ? '' : 'none';
    $('gShop').style.display = gtab === 'shop' ? '' : 'none';
    if (gtab === 'shop') return renderShop();
    const f = featured();
    setArt($('bannerArt'), f.id);
    $('pickName').innerHTML = `${rk('SS')} ${f.name}`;
    $('pickDesc').textContent = `${f.role} · ${f.desc} — SS 등장 시 ${Math.round(G_.featuredShare * 100)}%는 픽업 대원`;
    $('rates').innerHTML = D.RANK_ORDER.map((r) => `<span>${rk(r)}${(G_.rates[r] * 100).toFixed(0)}%</span>`).join('') + `<span>· 중복은 그 대원의 카드 (업그레이드 재료)</span>`;
    $('pity').innerHTML = `SS 확정까지 <b>${G_.pity - save.pity}</b>회 · 픽업 ${f.name} ${(G_.rates.SS * G_.featuredShare * 100).toFixed(1)}%<div class="pity-bar"><i style="width:${(save.pity / G_.pity) * 100}%"></i></div>`;
    $('pull1').disabled = save.parts < G_.cost1;
    $('pull10').disabled = save.parts < G_.cost10;
    const box = $('ssList');
    box.innerHTML = '';
    SS.forEach((u) => box.appendChild(unitCard(u, () => openDetail(u))));
  }

  // recruit shop: any unit for tuna (an owned one comes as copies of its card), and wild cards
  let shopFilter = 'SS';
  function renderShop() {
    const fl = $('shopFilter');
    fl.innerHTML = D.RANK_ORDER.slice().reverse().map((r) => `<button data-r="${r}" class="${shopFilter === r ? 'on' : ''}">${rk(r)}${r}</button>`).join('') +
      '<span class="count">참치로 원하는 대원을 확정 영입 · 보유 대원은 카드로 받아 업그레이드 재료</span>';
    fl.querySelectorAll('button').forEach((b) => { b.onclick = () => { shopFilter = b.dataset.r; renderShop(); }; });
    const box = $('shopList');
    box.innerHTML = '';
    // wild cards of this rank
    const w = D.WILD_SHOP[shopFilter];
    const wb = document.createElement('button');
    wb.className = `wildbuy r-${shopFilter}`;
    wb.innerHTML = `<i class="wild-i r-${shopFilter}">${shopFilter}</i><b>${shopFilter} 와일드카드 ×${w.n}</b><small>${shopFilter} 등급 아무 카드나 대신 · 보유 ${fmt(save.wild[shopFilter])}</small><span class="price"><i class="tuna-i"></i>${fmt(w.price)}</span>`;
    wb.onclick = () => {
      if (save.tuna < w.price) return GAME.toast('참치가 부족합니다');
      save.tuna -= w.price; save.wild[shopFilter] += w.n; persist();
      AUDIO.play('purchase'); refresh(); GAME.toast(`${shopFilter} 와일드카드 +${w.n}`);
    };
    box.appendChild(wb);
    D.UNITS.filter((u) => u.rank === shopFilter).sort((a, b) => owned(a.id) - owned(b.id)).forEach((u) => {
      const price = u.rank === 'SS' && !owned(u.id) ? D.SHOP_NEW_SS : D.SHOP_PRICE[u.rank];
      const n = D.SHOP_CARDS[u.rank];
      const c = unitCard(u, () => {
        modal('확정 영입', `<div class="buy"><img src="${IMG['u_' + u.id]}" alt=""><div>${rk(u.rank)} <b>${u.name}</b><br>${owned(u.id) ? `보유 중 — 카드 +${n} (${fmt(cardsOf(u.id))} → ${fmt(cardsOf(u.id) + n)})` : '새로 합류합니다'}
          <br><i class="tuna-i"></i> <b>${fmt(price)}</b> (보유 ${fmt(save.tuna)})</div></div>`, [
          ['영입', () => {
            if (save.tuna < price) return GAME.toast('참치가 부족합니다');
            save.tuna -= price;
            const r = obtain(u, false, n);
            persist(); closeModal(); refresh();
            AUDIO.play(u.rank === 'SS' ? 'pickSS' : 'purchase');
            if (window.VOICE && VOICE[u.id]) AUDIO.voice(VOICE[u.id]);
            GAME.toast(r.isNew ? `${u.name} 합류!` : `${u.name} 카드 +${r.cards}`);
          }, save.tuna >= price ? '' : 'd'],
          ['취소', closeModal, 'd'],
        ]);
      }, price);
      box.appendChild(c);
    });
  }

  function rollRank(forceS) {
    save.pity++;
    save.pulls++;
    let rank;
    if (save.pity >= G_.pity) rank = 'SS';
    else {
      let r = Math.random(), acc = 0;
      rank = 'B';
      for (const k of D.RANK_ORDER) { acc += G_.rates[k]; if (r < acc) { rank = k; break; } }
    }
    if (forceS && (rank === 'B' || rank === 'A')) rank = 'S';
    if (rank === 'SS') save.pity = 0;
    return rank;
  }

  function pull(n) {
    if (n === 10 && !save.tut && !save.tutPulled) return showResult(tutorialPull());
    const cost = n === 10 ? G_.cost10 : G_.cost1;
    if (save.parts < cost) return GAME.toast('부품이 부족합니다');
    save.parts -= cost;
    const out = [];
    for (let i = 0; i < n; i++) {
      const last = n === 10 && i === 9 && !out.some((o) => o.u.rank === 'S' || o.u.rank === 'SS');
      const rank = rollRank(last);
      const pool = D.UNITS.filter((u) => u.rank === rank);
      let u = pool[Math.floor(Math.random() * pool.length)];
      if (rank === 'SS' && Math.random() < G_.featuredShare) u = featured();
      out.push(Object.assign({ u }, obtain(u)));
    }
    persist();
    showResult(out);
  }
  $('pull1').onclick = () => pull(1);
  $('pull10').onclick = () => pull(10);

  // reveal: cards flip one by one; every SS stops for its full-body illustration and its join line
  let reveal = null;
  function showResult(out) {
    const grid = $('gresGrid');
    grid.className = 'gres-grid' + (out.length === 1 ? ' one' : '');
    grid.innerHTML = '';
    const cards = out.map(({ u, isNew, cards: n }) => {
      const c = document.createElement('div');
      c.className = `gcard r-${u.rank}`;
      c.innerHTML = `<img src="${IMG['u_' + u.id]}" alt="">${rk(u.rank)}${isNew ? '<span class="new">NEW</span>' : `<span class="dup">카드 +${n}</span>`}<div class="nm">${u.name}</div>`;
      grid.appendChild(c);
      return c;
    });
    $('gachaResult').classList.add('show');
    $('gresOk').style.display = 'none';
    $('gresSkip').style.display = '';
    const best = out.reduce((m, o) => Math.max(m, rankIx(o.u)), 0);
    AUDIO.play(best >= 3 ? 'genSS' : best >= 2 ? 'genS' : 'genA');
    let i = 0;
    reveal = { out, cards, skip: false };
    const next = () => {
      if (!reveal || i >= out.length) return done();
      const o = out[i], c = cards[i];
      i++;
      if (o.u.rank === 'SS' && !reveal.skip) {
        ssSolo(o, () => { c.classList.add('open'); setTimeout(next, 200); });
        return;
      }
      c.classList.add('open');
      if (o.u.rank === 'S') AUDIO.play('rankUp', 0.6);
      setTimeout(next, reveal.skip ? 0 : o.u.rank === 'S' ? 320 : 160);
    };
    const done = () => {
      cards.forEach((c) => c.classList.add('open'));
      $('gresOk').style.display = '';
      $('gresSkip').style.display = 'none';
    };
    setTimeout(next, 450);
  }

  function ssSolo(o, then) {
    const flash = $('gresFlash');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    AUDIO.play('pickSS');
    setArt($('soloArt'), o.u.id);
    $('soloName').textContent = o.u.name;
    $('soloNew').textContent = o.isNew ? 'NEW!' : `카드 +${o.cards}`;
    const solo = $('gresSolo');
    setTimeout(() => {
      solo.classList.add('show');
      if (window.VOICE && VOICE[o.u.id]) AUDIO.voice(VOICE[o.u.id]);
    }, 350);
    const close = () => { solo.classList.remove('show'); solo.onclick = null; if (reveal) reveal.closeSolo = null; then(); };
    solo.onclick = close;
    reveal.closeSolo = close;
  }

  $('gresSkip').onclick = () => {
    if (!reveal) return;
    reveal.skip = true;
    if (reveal.closeSolo) reveal.closeSolo();
  };
  $('gresOk').onclick = () => {
    $('gachaResult').classList.remove('show');
    $('gresSolo').classList.remove('show');
    reveal = null;
    refresh();
  };

  // ── battle ─────────────────────────────────────────────
  let deckEls = [];
  // st: a stage object (campaign, hard or an infinite floor)
  async function launch(st) {
    const deck = st.squad ? st.squad.map((id) => ({ def: D.UNIT[id], lv: st.squadLv })) // daily: a fixed squad (battle level)
      : save.deck.map((id) => ({ def: D.UNIT[id], lv: relOf(id) }));
    show('loading');
    $('loadCode').textContent = st.code;
    $('loadTitle').textContent = st.name;
    $('loadBar').style.width = '0%';
    $('loadPct').textContent = '0%';
    await GAME.preload(st, deck.map((d) => d.def), (p) => {
      $('loadBar').style.width = Math.round(p * 100) + '%';
      $('loadPct').textContent = Math.round(p * 100) + '%';
    });
    buildDeck(deck);
    show('hud');
    fitHud();
    $('hudCode').textContent = st.code;
    $('hudStage').textContent = st.name;
    $('btnSpeed').firstChild.textContent = 'x1';
    tutorialStart(st);
    GAME.start(st, deck, { onFrame: syncHud, onEnd: (kind) => result(st, kind), onSkill: (def) => cutIn(def), onBoss: (name) => { banner('caution', name); const b = !st.hard && !st.infinite && st.last && STORY.BATTLE[st.chapter]; if (b) setTimeout(() => comm(b.boss), 2700); /* after the boss reveal */ } });
    const beats = !st.hard && !st.infinite && STORY.BATTLE[st.chapter];
    if (beats && (st.no === 1 || st.last)) setTimeout(() => comm(beats.start), 1800);
    banner('start', st.mod ? `작전 조건 · ${D.MODS[st.mod].name}: ${D.MODS[st.mod].tip}` : '');
  }

  // an ordered SS skill: the unit's illustration sweeps across, with its battle line
  function cutIn(def) {
    const el = $('cutin');
    setArt($('cutinArt'), def.id);
    $('cutinName').textContent = def.name;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    if (window.BARK && BARK[def.id]) AUDIO.voice(BARK[def.id].skill);
    AUDIO.play('pickSS', 0.6);
  }

  // a comm line over the battle: portrait, name, text (a few seconds)
  let commT = 0;
  function comm([id, text]) {
    if (!GAME.state || GAME.state.over) return;
    const u = D.UNIT[id];
    $('commImg').src = IMG['u_' + id];
    $('commName').textContent = u ? u.name : id;
    $('commText').textContent = text;
    const el = $('comm');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(commT);
    commT = setTimeout(() => el.classList.remove('show'), 3800);
  }

  // MISSION START / CAUTION strips (the original battle text sprites)
  function banner(kind, name) {
    const layer = $('bannerLayer');
    const el = document.createElement('div');
    el.className = 'bnr' + (kind === 'caution' ? ' caution' : '');
    el.innerHTML = kind === 'caution' ? `<div class="ct"><i class="mk"></i><i class="tx"></i><span class="bn">${name}</span><i class="mk"></i></div>`
      : `<div class="ms-wrap"><i class="ms"></i>${name ? `<div class="cond">${name}</div>` : ''}</div>`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  // phones: the deck shows five cards at a time, the swap button flips between 1-5 and 6-10 (as in Battle Cats)
  let deckPage = 0;
  function setDeckPage(p) {
    deckPage = p;
    $('deck').dataset.page = p;
    $('swapPage').textContent = `${p + 1}/2`;
  }
  $('btnSwap').onpointerdown = (e) => {
    e.preventDefault(); AUDIO.play('click', 0.4, 1.3);
    const d = $('deck');
    d.classList.remove('swapping'); void d.offsetWidth; d.classList.add('swapping'); // replay the sweep
    setDeckPage(deckPage ? 0 : 1);
    clearTimeout(d.swapT); d.swapT = setTimeout(() => d.classList.remove('swapping'), 360);
  };
  // the battle HUD never takes more than its share of the screen: phones and squarish screens (folds) get the
  // one-row deck with the swap, then the whole bar scales down if it is still too tall; the camera lifts the lane above it
  function fitHud() {
    const hb = document.querySelector('.hud-bottom'), top = document.querySelector('.hud-top');
    if (!hb) return;
    const W = innerWidth, H = innerHeight, portrait = W < H * 0.9, touch = matchMedia('(pointer: coarse)').matches;
    const budget = H * (portrait ? 0.4 : touch ? 0.28 : 0.36); // PC keeps both rows (number keys) unless the window is tiny
    hb.style.zoom = top.style.zoom = '';
    document.body.classList.toggle('deck1', W <= 640 || H <= 520);
    if (touch && !document.body.classList.contains('deck1') && hb.offsetHeight > budget) document.body.classList.add('deck1');
    const h = hb.offsetHeight;
    if (h > budget) {
      const z = Math.max(0.55, budget / h); // cards stay ~55px tall: still easy to tap
      hb.style.zoom = z.toFixed(3); top.style.zoom = Math.max(0.8, z).toFixed(3);
    }
    // the top bar's content edge (its gradient padding may overlap): base labels are kept below it
    const tb = Math.max(...[...top.children].map((e) => e.getBoundingClientRect().bottom), 0);
    if (GAME.setHudInset) GAME.setHudInset(hb.getBoundingClientRect().height / H, tb + 2);
  }
  let fitT = 0; // rotate / resize: fit now and again once the size has settled
  const refit = () => { if (!$('hud').classList.contains('show')) return; fitHud(); clearTimeout(fitT); fitT = setTimeout(fitHud, 250); };
  addEventListener('resize', refit);
  if (window.ResizeObserver) new ResizeObserver(refit).observe($('hud')); // also catches rotations that skip the resize event

  function buildDeck(deck) {
    const el = $('deck');
    setDeckPage(0);
    $('btnSwap').classList.toggle('on', deck.length > 5);
    el.innerHTML = '';
    deckEls = [];
    // two rows of five, each its own layer: on phones the second sits behind the first (as in Battle Cats)
    const rows = [0, 1].map((p) => { const d = document.createElement('div'); d.className = 'dpage'; d.dataset.p = p; el.appendChild(d); return d; });
    for (let i = 0; i < 10; i++) {
      const s = deck[i];
      const b = document.createElement('button');
      b.className = 'slot' + (s ? ` r-${s.def.rank}` : ' empty');
      b.dataset.page = i < 5 ? 0 : 1; // phones show one row of five at a time (the swap button flips)
      if (s) {
        b.innerHTML = `<img src="${IMG['u_' + s.def.id]}" alt="">${rk(s.def.rank)}<div class="cd"></div><div class="c">${s.def.cost}</div><div class="snm">${s.def.name.replace(/ .*/, '')}</div>` +
          (s.def.rank === 'SS' || s.def.rank === 'S' ? '<span class="sk" title="스킬 충전 (차면 자동 발동)"><i></i></span>' : '');
        b.title = `${s.def.name} (${s.def.rank} ${s.def.role})  [${(i + 1) % 10}]`;
        b.onpointerdown = (e) => { e.preventDefault(); GAME.deploy(i); };
      }
      rows[i < 5 ? 0 : 1].appendChild(b);
      deckEls.push(s ? { b, cd: b.querySelector('.cd'), def: s.def, sk: b.querySelector('.sk') } : null);
    }
  }

  // ── the tutorial after 1-1: making → squad → missions → 1-2 (the coach in the lobby) ──
  // The first 10-pull has a fixed result, and a skip reaches exactly the state of finishing it (same functions).
  const TUT_PULL = ['daphne', 'banshee', 'sylphid', 'daphne', 'amy', 'banshee', 'andvari', 'daphne', 'sylphid', 'valkyrie'];
  const TUT_ADD = 'valkyrie'; // the S of that pull: the player puts her in the squad
  function tutorialPull() {
    save.parts = Math.max(0, save.parts - G_.cost10);
    save.pulls += 10; save.pity += 10;
    save.tutPulled = 1;
    const out = TUT_PULL.map((id) => Object.assign({ u: D.UNIT[id] }, obtain(D.UNIT[id], true, D.PULL_CARDS[D.UNIT[id].rank][0])));
    persist();
    return out;
  }
  const navBtn = (p) => document.querySelector(`.nav[data-pane="${p}"]`);
  const modalBtn = (label) => [...document.querySelectorAll('#modal.show button')].find((b) => b.textContent.trim() === label);
  // each step: the pane it happens in, its target, its line, and when it is done
  const LT = [
    { pane: 'gacha', el: () => (gtab === 'making' ? $('pull10') : document.querySelector('.gtab[data-g="making"]')),
      text: '전투에서 얻은 <b>부품</b>으로 새 대원을 <b>제조</b>합니다. <b>10회 제조</b>를 눌러 보세요!', done: () => !!save.tutPulled },
    { pane: 'squad', el: () => ($('cardMenu').dataset.id === TUT_ADD && document.querySelector('#cardMenu.show .cm-use')) || document.querySelector(`#squadList .crc[data-id="${TUT_ADD}"]`),
      text: () => (document.querySelector('#cardMenu.show .cm-use') ? '<b>사용</b>을 눌러 발키리를 덱에 넣으세요.' : '새로 합류한 <b>발키리</b> 카드를 눌러 보세요.'),
      done: () => save.deck.includes(TUT_ADD) },
    { pane: 'missions', el: () => document.querySelector('#missionList .mis[data-mid="tut1"] button'),
      text: '<b>임무</b>를 달성하면 보상을 받습니다. <b>받기</b>를 눌러 보세요!', done: () => !!(save.claimed || {}).tut1 },
    { pane: 'campaign', el: () => (chapterOpen !== 0 ? document.querySelector('#chapterList .chap[data-ch="0"]')
      : selStage !== 1 || !infoShown() ? document.querySelector('#pStages .node[data-ix="1"]') : $('btnGo')),
      text: () => (chapterOpen !== 0 ? '준비 완료! <b>CHAPTER 1</b>로 돌아갑니다.' : selStage !== 1 || !infoShown() ? '다음 작전 <b>1-2</b>를 선택하세요.' : '<b>출격</b>! 이제부터는 사령관의 판단에 맡깁니다.'),
      done: () => !!save.tut },
  ];
  const PANE_NAME = { gacha: '제조', squad: '대원', missions: '임무', campaign: '작전' };
  // the coach is in the lobby: after 1-1, until 1-2 is launched
  const lobbyTut = () => !save.tut && !noSave && save.cleared >= 1;
  function lobbyTutTick() {
    const coach = $('lcoach');
    const on = lobbyTut() && $('lobby').classList.contains('show') && !$('story').classList.contains('show') && !$('gachaResult').classList.contains('show');
    $('tutSkip').classList.toggle('show', !save.tut && !noSave && (on || !!tut));
    if (!on) { coach.classList.remove('show'); document.querySelectorAll('.lpulse').forEach((e) => e.classList.remove('lpulse')); return; }
    save.tutStep = save.tutStep || 0;
    while (save.tutStep < LT.length && LT[save.tutStep].done()) { save.tutStep++; persist(); }
    const s = LT[Math.min(save.tutStep, LT.length - 1)];
    let el, text;
    if (pane !== s.pane && !($('modal').classList.contains('show') && s.pane === 'squad')) { el = navBtn(s.pane); text = `<b>${PANE_NAME[s.pane]}</b> 탭으로 이동하세요.`; }
    else { el = s.el(); text = typeof s.text === 'function' ? s.text() : s.text; }
    if (!el || !el.offsetParent) { coach.classList.remove('show'); return; }
    if (!el.classList.contains('lpulse')) { document.querySelectorAll('.lpulse').forEach((e) => e.classList.remove('lpulse')); el.classList.add('lpulse'); }
    if ($('lcoachText').innerHTML !== text) $('lcoachText').innerHTML = text;
    coach.classList.add('show');
    placeCoach(coach, $('lcoachArrow'), el);
  }
  setInterval(lobbyTutTick, 200);
  // a forced tutorial: while the coach points at something, taps anywhere else do nothing (the skip button, popups
  // the step opens, the story and the battlefield drag stay usable)
  function tutGuard(e) {
    const t = e.target;
    if (!(t instanceof Element) || save.tut || noSave) return;
    const lobbyOn = $('lcoach').classList.contains('show');
    const battleOn = !!tut && $('hud').classList.contains('show');
    if (!lobbyOn && !battleOn) return;
    const target = document.querySelector(lobbyOn ? '.lpulse' : '.pulse-target');
    if (!target) return; // nothing pointed at (a step waiting): free play
    if (target.contains(t) || t.closest('#tutSkip, #modal, #gachaResult, #story, #lcoach, #coach, #cardMenu') || (battleOn && t.id === 'gl')) return;
    e.stopPropagation(); e.preventDefault();
    if (e.type === 'pointerdown') { // a nudge towards the right spot
      target.classList.remove('tut-nudge'); void target.offsetWidth; target.classList.add('tut-nudge');
      setTimeout(() => target.classList.remove('tut-nudge'), 400); // back to its pulse
    }
  }
  for (const ev of ['pointerdown', 'click']) addEventListener(ev, tutGuard, { capture: true });
  // a bubble next to its target: above it in the lower part of the screen, below it otherwise
  function placeCoach(coach, arrow, el) {
    const r = el.getBoundingClientRect(), w = coach.offsetWidth, h = coach.offsetHeight;
    const below = r.top < innerHeight * 0.4;
    const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    coach.style.left = x + 'px';
    coach.style.top = (below ? r.bottom + 14 : r.top - h - 14) + 'px';
    coach.classList.toggle('up', below);
    coach.classList.toggle('down', !below);
    arrow.style.left = Math.max(14, Math.min(w - 14, r.left + r.width / 2 - x)) + 'px';
  }
  // skip: the same end state as playing it through (1-1 cleared, the fixed pull, 발키리 in the squad, the mission
  // claimed), then the stage map at 1-2
  function finishTutorial() {
    if (save.tut) return;
    save.tut = 1; save.tutBattle = 1; save.tutStep = LT.length;
    persist();
    $('lcoach').classList.remove('show'); $('tutSkip').classList.remove('show');
    document.querySelectorAll('.lpulse').forEach((e) => e.classList.remove('lpulse'));
  }
  function skipTutorial() {
    if (GAME.state) GAME.stop();
    tut = null; $('coach').classList.remove('show'); closeModal();
    if (story) { const st = story; story = null; if (st.typing) clearInterval(st.typing); $('story').classList.remove('show'); }
    if (save.cleared < 1) { // 1-1 as a first clear
      const st0 = D.STAGES[0];
      save.cleared = 1; save.stars[0] = Math.max(save.stars[0] || 0, 3); save.seen[storyBefore(st0)] = 1;
      gain(D.reward(st0, 'first'));
    }
    if (!save.tutPulled) tutorialPull();
    if (!save.deck.includes(TUT_ADD) && fits(TUT_ADD)) save.deck.push(TUT_ADD);
    const m = D.MISSIONS.find((x) => x.id === 'tut1');
    save.claimed = save.claimed || {};
    if (!save.claimed.tut1) { save.claimed.tut1 = 1; save.tuna += m.reward.tuna; save.parts += m.reward.parts; addWild(m.reward.wild); }
    finishTutorial();
    mode = 'normal';
    openLobby('campaign', 0);
    selStage = 1; renderStages();
    GAME.toast('튜토리얼을 건너뛰었습니다');
  }
  $('tutSkip').onclick = () => {
    AUDIO.play('click', 0.5);
    modal('튜토리얼 건너뛰기', '튜토리얼을 마친 것과 같은 상태로 시작합니다.<br>(1-1 클리어 · 첫 제조 결과 · 발키리 편성 · 임무 보상)', [
      ['건너뛰기', skipTutorial, 'o'],
      ['계속하기', closeModal, 'd'],
    ]);
  };

  // ── first battle coaching (1-1 until finished once) ────
  // each step: target element, text, done(G) — advanced from the HUD sync
  const TUT = [
    { el: () => document.querySelector('#deck .slot'), text: (G) => `<b>${G.deck[0].def.name}</b> 버튼을 눌러 출격! 대원은 앞으로 걸어가 사거리 안의 적을 원작 공격 모션으로 공격합니다.`, done: (G) => G.allies.length > 0 },
    { el: () => $('btnWorker'), text: '<b>전력</b>은 계속 차오릅니다. <b>발전 효율</b>을 올리면 더 빨리, 더 많이 모입니다.', done: (G, t) => G.worker > 0 || t > 14 },
    { el: () => $('deck'), text: '비용과 재배치 시간을 보며 섞어 내보내세요. <b>레프리콘</b>은 튼튼한 벽, <b>노움</b>은 범위 포격입니다.', done: (G, t) => t > 9 },
    { el: () => $('btnCannon'), text: '<b>오르카 포격</b> 준비 완료! 눌러서 앞의 철충을 한꺼번에 밀어내세요.', wait: (G) => G.cannon >= D.CANNON.charge, done: (G) => G.cannon < D.CANNON.charge },
    { el: () => $('timer'), text: '화면을 끌거나 상단 미니맵을 눌러 전장을 볼 수 있습니다. <b>10분 안에</b> 철충 요새를 부수면 승리!', done: (G, t) => t > 8 },
  ];
  let tut = null;
  function tutorialStart(st) {
    TUT.forEach((s) => { delete s.waited; });
    tut = !save.tut && !save.tutBattle && !st.hard && !st.infinite && !st.daily && st.ix === 0 ? { i: 0, t: 0, last: performance.now() } : null;
    $('coach').classList.remove('show');
  }
  function tutorialStep(G) {
    if (!tut) return;
    const now = performance.now(), dt = (now - tut.last) / 1000;
    tut.last = now;
    if (!G.paused) tut.t += dt;
    const s = TUT[tut.i];
    const coach = $('coach');
    if (s.wait && !s.waited) {
      if (!s.wait(G)) { coach.classList.remove('show'); tut.t = 0; return; }
      s.waited = true; tut.t = 0;
    }
    if (s.done(G, tut.t)) {
      document.querySelectorAll('.pulse-target').forEach((e) => e.classList.remove('pulse-target'));
      tut.i++; tut.t = 0;
      if (tut.i >= TUT.length) { tut = null; save.tutBattle = 1; persist(); coach.classList.remove('show'); }
      return;
    }
    const el = s.el();
    if (!el) return;
    if (!el.classList.contains('pulse-target')) {
      document.querySelectorAll('.pulse-target').forEach((e) => e.classList.remove('pulse-target'));
      el.classList.add('pulse-target');
      $('coachText').innerHTML = typeof s.text === 'function' ? s.text(G) : s.text;
      coach.classList.add('show');
    }
    // place the bubble next to its target: above it in the lower half of the screen, below it otherwise
    const r = el.getBoundingClientRect(), w = coach.offsetWidth, h = coach.offsetHeight;
    const below = r.top < innerHeight * 0.4;
    const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    coach.style.left = x + 'px';
    coach.style.top = (below ? r.bottom + 14 : r.top - h - 14) + 'px';
    coach.classList.toggle('up', below);
    coach.classList.toggle('down', !below);
    $('coachArrow').style.left = Math.max(14, Math.min(w - 14, r.left + r.width / 2 - x)) + 'px';
  }

  // ── settings / help ────────────────────────────────────
  function openSettings(back) {
    const row = (k, label) => `<div class="opt-row"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(AUDIO.volume(k) * 100)}" data-k="${k}"><b>${Math.round(AUDIO.volume(k) * 100)}</b></div>`;
    modal('설정', row('bgm', '배경음') + row('sfx', '효과음') + row('voice', '음성') +
      `<div class="opt-row opt-toggle"><span>스토리 다시 보기</span><button id="optStory" class="tgl${save.storyAlways ? ' on' : ''}">${save.storyAlways ? 'ON' : 'OFF'}</button>
        <small>ON: 스테이지 스토리를 매번 보여 줍니다 · OFF: 한 번 본 스토리는 건너뜁니다</small></div>` +
      (fsOk ? `<div class="opt-row opt-toggle"><span>전체화면</span><button id="optFs" class="tgl${save.fullscreen ? ' on' : ''}">${save.fullscreen ? 'ON' : 'OFF'}</button>
        <small>ON: 주소창 없이 화면 전체로 플레이합니다 (작전 개시 때 자동 전환)</small></div>` : '') +
      `<div style="margin-top:12px;font-size:12px">튜토리얼은 1-1에서 다시 볼 수 있습니다.<span style="float:right;color:var(--dim)">${VERSION}</span></div>`, [
      ['확인', back || closeModal],
      ['도움말', () => openHelp(), 'd'],
      ['세이브 내보내기 / 불러오기', () => openSaveIO(), 'd'],
      ['튜토리얼 다시 보기', () => { save.tutBattle = 0; persist(); closeModal(); GAME.toast('1-1 출격 시 전투 튜토리얼이 나옵니다'); }, 'd'],
      ['세이브 초기화', () => {
        modal('세이브 초기화', '모든 진행 · 대원 · 재화가 사라집니다. 정말 초기화할까요?', [
          ['초기화', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } location.reload(); }, 'o'],
          ['취소', closeModal, 'd'],
        ]);
      }, 'd'],
    ]);
    $('optStory').onclick = () => {
      save.storyAlways = !save.storyAlways; persist(); AUDIO.play('click', 0.6, 1.15);
      $('optStory').classList.toggle('on', save.storyAlways); $('optStory').textContent = save.storyAlways ? 'ON' : 'OFF';
    };
    if (fsOk) $('optFs').onclick = () => {
      save.fullscreen = !save.fullscreen; persist(); AUDIO.play('click', 0.6, 1.15);
      $('optFs').classList.toggle('on', save.fullscreen); $('optFs').textContent = save.fullscreen ? 'ON' : 'OFF';
      if (save.fullscreen) enterFs(); else exitFs();
    };
    document.querySelectorAll('.opt-row input').forEach((inp) => {
      inp.oninput = () => { AUDIO.setVolume(inp.dataset.k, inp.value / 100); inp.nextElementSibling.textContent = inp.value; };
      inp.onchange = () => AUDIO.play('click', 0.6);
    });
  }
  // save backup: the save as a base64 code to copy, or a pasted code to restore
  function openSaveIO() {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(save))));
    modal('세이브 백업', `<div style="font-size:12px;margin-bottom:6px">아래 코드를 복사해 두면 다른 브라우저에서 불러올 수 있습니다.</div>
      <textarea id="saveCode" class="savecode" readonly>${code}</textarea>
      <div style="font-size:12px;margin:10px 0 6px">불러오기: 코드를 붙여 넣고 불러오기를 누르세요.</div>
      <textarea id="loadCode" class="savecode" placeholder="세이브 코드"></textarea>`, [
      ['복사', () => { const t = $('saveCode'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand('copy'); } GAME.toast('복사했습니다'); }],
      ['불러오기', () => {
        try {
          const data = JSON.parse(decodeURIComponent(escape(atob($('loadCode').value.trim()))));
          if (typeof data !== 'object' || data.cleared == null) throw new Error('bad');
          localStorage.setItem(SAVE_KEY, JSON.stringify(data));
          location.reload();
        } catch (e) { GAME.toast('올바른 세이브 코드가 아닙니다', true); }
      }, 'b'],
      ['닫기', closeModal, 'd'],
    ], true);
  }

  function openHelp() {
    modal('작전 안내', `<div class="help">
      <h4>전투</h4><p>왼쪽 오르카 기지에서 대원을 내보내 오른쪽 철충 요새를 부수면 승리. 기지가 무너지거나 10분이 지나면 패배합니다.
      대원은 걷다가 사거리 안에 적이 오면 멈춰 공격하고, 체력이 깎이면 뒤로 밀려납니다(넉백).</p>
      <h4>전력 · 포격</h4><p>전력은 시간이 지나면 차오르고 적을 쓰러뜨리면 더 들어옵니다. 발전 효율을 올리면 충전 속도와 최대 전력이 커집니다.
      오르카 포격은 충전되면 기지 앞 적을 모두 때리고 밀어냅니다.</p>
      <h4>편성</h4><p>최대 10명, 편성 코스트 ${D.DECK_CAP} 이하(B ${D.DECK_COST.B} · A ${D.DECK_COST.A} · S ${D.DECK_COST.S} · SS ${D.DECK_COST.SS}).
      싼 벽 유닛과 화력 유닛을 섞는 것이 기본입니다.</p>
      <h4>성장</h4><p>XP로 레벨 업(체력 · 공격 +20%/레벨). 같은 대원을 다시 얻으면 코어 링크(최대 5, 링크당 +8%, 풀 링크 재배치 -15%).</p>
      <h4>재화</h4><p><b>부품</b>: 모든 승리에서 획득 → 제조(가챠). <b>참치</b>: 첫 클리어 · 새 기록에서 획득 → 원하는 대원 확정 영입.</p>
      <h4>별점 · 콘텐츠</h4><p>6분 안에 이기면 ★2, 기지 체력도 80% 이상 지키면 ★3. 노말 챕터를 깨면 하드가, 8-10을 깨면 무한 전장이 열립니다.</p>
      <h4>조작</h4><p>대원 버튼 / 1~0 배치 · E 발전 효율 · F / Space 포격 · 드래그 · 휠 · 방향키 · 미니맵 이동 · P / Esc 일시정지</p></div>`,
    [['확인', closeModal]], true);
  }
  $('btnOpt').onclick = () => { AUDIO.play('click', 0.5); openSettings(); };
  $('btnHelp').onclick = () => { AUDIO.play('click', 0.5); openHelp(); };

  let lastMoney = -1;
  function syncHud(G) {
    tutorialStep(G);
    const left = Math.max(0, GAME.TIME_LIMIT - G.t);
    const tm = $('timer');
    tm.textContent = `${Math.floor(left / 60)}:${pad2(Math.floor(left % 60))}`;
    tm.classList.toggle('warn', left < 180);
    const m = Math.floor(G.money);
    if (m !== lastMoney) { $('money').textContent = m; lastMoney = m; }
    $('wallet').textContent = GAME.wallet();
    document.querySelector('.money').classList.toggle('full', G.money >= GAME.wallet() - 1);
    $('powerFill').style.width = Math.min(100, (G.money / GAME.wallet()) * 100) + '%'; // the power gauge
    let otherReady = false;
    deckEls.forEach((d, i) => {
      if (!d) return;
      const cd = G.cds[i];
      d.cd.style.height = cd > 0 ? (cd / d.def.cd) * 100 + '%' : '0';
      const poor = G.money < d.def.cost;
      d.b.classList.toggle('poor', poor);
      const busy = GAME.onField(d.def); // an SS already fighting: the card waits for it
      if (!poor && cd <= 0 && !busy && (i < 5 ? 0 : 1) !== deckPage) otherReady = true;
      d.b.classList.toggle('busy', busy);
      d.b.classList.toggle('ready', !poor && cd <= 0 && !busy);
      if (d.sk) { // SS: the skill chip shows the best charge among the deployed copies
        const k = GAME.skillState(i);
        d.sk.classList.toggle('on', k != null && k >= 0);
        d.sk.classList.toggle('full', k >= 1);
        d.sk.style.setProperty('--p', Math.max(0, Math.min(1, k)));
        d.b.classList.toggle('skready', k >= 1);
        // the first time a skill is ready: one hint
      }
    });
    $('btnSwap').classList.toggle('ready', otherReady); // a card on the other page is ready
    const wmax = G.worker >= D.WORKER.cost.length;
    $('workerLv').textContent = wmax ? 'MAX' : G.worker + 1;
    $('workerCost').textContent = wmax ? '최대' : D.WORKER.cost[G.worker];
    $('btnWorker').classList.toggle('max', wmax);
    $('btnWorker').classList.toggle('off', !wmax && G.money < D.WORKER.cost[G.worker]);
    const ready = G.cannon >= D.CANNON.charge;
    $('cannonFill').style.height = (G.cannon / D.CANNON.charge) * 100 + '%';
    $('btnCannon').classList.toggle('ready', ready);
    $('cannonTxt').textContent = ready ? '발사!' : (G.st.cannonK ? 'EMP ' : '') + Math.round((G.cannon / D.CANNON.charge) * 100) + '%';
  }

  $('btnWorker').onpointerdown = (e) => { e.preventDefault(); GAME.upgradeWorker(); };
  $('btnCannon').onpointerdown = (e) => { e.preventDefault(); GAME.fireCannon(); };
  $('btnSpeed').onclick = () => {
    const G = GAME.state;
    if (!G) return;
    const s = G.speed === 1 ? 2 : 1;
    GAME.setSpeed(s);
    $('btnSpeed').firstChild.textContent = 'x' + s;
  };
  $('btnPause').onclick = () => { if (GAME.state && !GAME.state.over) pause(true); };
  // HUD buttons never keep focus (Space / Enter belong to the battle keys)
  document.querySelectorAll('#hud button').forEach((b) => b.addEventListener('focus', () => b.blur()));
  addEventListener('keydown', (e) => { if (!story && (e.key === 'p' || e.key === 'P' || e.key === 'Escape') && GAME.state && !GAME.state.over) pause(!GAME.state.paused); });
  addEventListener('visibilitychange', () => { if (document.hidden && GAME.state && !GAME.state.over && !GAME.state.paused) pause(true); });

  function pause(on) {
    GAME.setPaused(on);
    if (!on) return closeModal();
    const st = GAME.state ? GAME.state.st : D.STAGES[0];
    modal('일시정지', '<b>조작</b><br>대원 버튼 / 숫자키 1~0 · 배치<br>E · 발전 효율 강화 &nbsp; F / Space · 오르카 포격<br>드래그 · 휠 · 방향키 · 미니맵 · 전장 이동', [
      ['계속하기', () => pause(false)],
      ['설정', () => openSettings(() => pause(true)), 'd'],
      ['재시작', () => { closeModal(); GAME.stop(); launch(st); }, 'd'],
      ...(tutBattle(st) ? [] : [['작전 포기', () => { closeModal(); GAME.stop(); backTo(st); }, 'o']]), // the tutorial battle can't be left
    ]);
  }
  const tutBattle = (st) => !save.tut && !noSave && save.cleared === 0 && !st.hard && !st.infinite && !st.daily && st.ix === 0;

  // back to where a stage was picked: its chapter (normal / hard) or the campaign list (infinite)
  function backTo(st) {
    if (st.infinite || st.daily) { mode = 'normal'; openLobby('campaign'); chapterOpen = -1; refresh(); return; }
    mode = st.hard ? 'hard' : 'normal';
    openLobby('campaign', st.chapter);
  }
  const wildHtml = (w) => (w ? Object.entries(w).filter(([, n]) => n).map(([r, n]) => `<span class="w"><i class="wild-i r-${r}">${r}</i>+${fmt(n)}</span>`).join('') : '');
  const rwRes = (r) => `<div class="rws"><span class="x"><i></i>+${fmt(r.xp)}</span><span class="p"><i></i>+${fmt(r.parts)}</span>${r.tuna ? `<span class="t"><i></i>+${fmt(r.tuna)}</span>` : ''}${wildHtml(r.wild)}</div>`;
  const addWild = (w) => { for (const r in w || {}) save.wild[r] = (save.wild[r] || 0) + w[r]; };
  const gain = (r) => { save.xp += r.xp; save.parts += r.parts; save.tuna += r.tuna; addWild(r.wild); };

  // stars: 1 for the win, 2 within 6 minutes, 3 within 6 minutes with the base at 80% or more
  function result(st, kind) {
    // battle stats (kill / deploy / skill missions) count only for a win: a defeat pays nothing at all
    if (kind === 'win') { const G0 = GAME.state; if (G0) { save.stats = save.stats || {}; for (const [k, v] of [['kills', G0.kills], ['deploys', G0.deploys], ['skills', G0.skillsUsed]]) { save.stats[k] = (save.stats[k] || 0) + (v || 0); bump(k, v || 0); } } }
    $('comm').classList.remove('show');
    tut = null; $('coach').classList.remove('show'); document.querySelectorAll('.pulse-target').forEach((e) => e.classList.remove('pulse-target'));
    const G = GAME.state;
    const left = G ? G.base.hp / G.base.max : 0;
    const t = G ? G.t : 0;
    const leave = () => { closeModal(); GAME.stop(); backTo(st); };
    if (kind === 'win') {
      const first = st.daily ? save.dailyDone !== st.day : st.infinite ? st.floor > save.infBest : st.ix >= (st.hard ? save.hardCleared : save.cleared);
      if (st.daily) { if (first) { save.stats = save.stats || {}; save.stats.dailies = (save.stats.dailies || 0) + 1; } save.dailyDone = st.day; }
      if (st.infinite) save.infRun = st.floor;
      const stars = t <= 360 ? (left >= 0.8 ? 3 : 2) : 1; // ★2: within 6 min, ★3: and the base kept 80%+
      bump('wins', 1); if (stars === 3) bump('star3', 1); if (st.hard || st.infinite) bump('elite', 1); if (st.daily) bump('daily', 1);
      const r = D.reward(st, first ? 'first' : 'win');
      gain(r);
      let joined = null;
      if (st.infinite) save.infBest = Math.max(save.infBest, st.floor);
      else if (!st.daily) {
        const book = st.hard ? save.hstars : save.stars;
        book[st.ix] = Math.max(book[st.ix] || 0, stars);
        if (first) {
          if (st.hard) save.hardCleared = st.ix + 1;
          else {
            save.cleared = st.ix + 1;
            if (st.last) { const rw = D.UNIT[D.CHAPTER_REWARD[st.chapter]]; if (rw && grant(rw.id)) joined = rw; }
          }
        }
      }
      persist();
      const body = `<div class="result">${st.infinite ? `<div class="big">FLOOR ${st.floor} CLEAR</div>` : '<div class="lbl"></div>'}
        ${st.infinite ? '' : `<div class="stars">${[0, 1, 2].map((k) => `<i class="${k < stars ? 'on' : ''}"></i>`).join('')}</div>`}
        <div>${st.code} ${st.name} · ${Math.floor(t / 60)}분 ${pad2(Math.floor(t % 60))}초 · 기지 체력 ${Math.round(left * 100)}%</div>
        ${rwRes(r)}
        ${!st.hard && !st.infinite && st.last ? (([id, line]) => `<div class="quote"><img src="${IMG['u_' + id]}" alt=""><span>${line}</span></div>`)(STORY.BATTLE[st.chapter].win) : ''}
        ${joined ? `<div class="join"><img src="${IMG['u_' + joined.id]}" alt=""><div>${rk(joined.rank)} <b>${joined.name}</b> 합류!</div></div>` : ''}</div>`;
      const btns = [];
      if (st.daily) { /* one daily stage */ } else if (st.infinite) btns.push(['다음 층', () => { closeModal(); GAME.stop(); pickBuff(st.floor + 1); }]);
      else {
        const outro = !st.hard && st.last && first ? `c${st.chapter + 1}_outro` : null;
        if (outro) { save.seen[outro] = 1; persist(); } // replayable from the chapter even if skipped now
        const pool = st.hard ? D.HARD : D.STAGES;
        const next = pool[st.ix + 1];
        const nextOpen = next && (!st.hard || save.cleared >= D.CHAPTERS[next.chapter].first + D.PER_CH);
        if (outro) btns.push(['스토리 보기', () => { closeModal(); GAME.stop(); show('lobby'); playStory(outro, () => titleCard(st.chapter, () => { mode = 'normal'; openLobby('campaign', next ? next.chapter : st.chapter); })); }]);
        else if (nextOpen && !lobbyTut()) btns.push(['다음 작전', () => { closeModal(); GAME.stop(); startStage(next); }]); // the tutorial goes back to the lobby first
      }
      btns.push([st.infinite ? '나가기' : lobbyTut() ? '계속' : '작전 지도', leave, lobbyTut() ? '' : 'd']);
      modal('', body, btns);
      if (joined && window.VOICE && VOICE[joined.id]) AUDIO.voice(VOICE[joined.id]);
    } else {
      if (st.infinite) { save.infBuffs = []; save.infRun = 0; st.buffs = []; } // the run ends: next time from floor 1
      persist(); // a defeat pays nothing (no XP, parts, wild cards or mission progress)
      const tutorial = tutBattle(st); // the tutorial battle: try again until it is won (or the tutorial is skipped)
      modal('', `<div class="result"><div class="big fail">MISSION FAILED</div>
        <div style="margin:8px 0">${kind === 'timeout' ? '작전 시간(10분)이 초과되었습니다. 전선을 돌파하지 못했습니다.' : '전진기지가 함락되었습니다.'}</div>
        <div style="margin-top:10px;font-size:13px">${tutorial ? '튜토리얼 작전입니다. 대원을 꾸준히 출격시키며 다시 도전해 보세요.' : '카드 업그레이드 · 편성을 바꿔 다시 도전해 보세요.'}</div></div>`, [
        ['재도전', () => { closeModal(); GAME.stop(); launch(st.infinite ? Object.assign(D.infiniteFloor(1), { buffs: [] }) : st); }],
        ...(tutorial ? [] : [
          ['대원 강화', () => { closeModal(); GAME.stop(); openLobby('squad'); }, 'd'],
          [st.infinite ? '나가기' : '작전 지도', leave, 'd'],
        ]),
      ]);
    }
  }

  // btns: [label, fn, style ('' yellow, 'd' dark, 'o' orange, 'b' blue)]
  function modal(title, body, btns, wide) {
    $('modalTitle').textContent = title;
    document.querySelector('.pwin-title').style.display = title ? '' : 'none';
    $('modalBody').innerHTML = body;
    document.querySelector('.pwin').classList.toggle('wide', !!wide);
    const box = $('modalBtns');
    box.innerHTML = '';
    btns.forEach(([label, fn, style]) => {
      const b = document.createElement('button');
      b.className = 'btn' + (style ? ' ' + style : '');
      b.textContent = label;
      b.onclick = () => { AUDIO.play('click', 0.55, 0.85); fn(); };
      box.appendChild(b);
    });
    $('modal').classList.add('show');
  }
  function closeModal() { $('modal').classList.remove('show'); }
  let lockModal = false; // a choice that must be made (infinite buffs)
  $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal') && !GAME.state && !lockModal) closeModal(); });
  addEventListener('resize', () => { if ($('lobby').classList.contains('show') && pane === 'campaign' && chapterOpen >= 0) renderStages(); });

  GAME.init();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
  // test hooks: ?unlock=1 opens everything (never saved), ?stage=3-5 / H3-5 / ∞4 jumps into a battle
  const q = new URLSearchParams(location.search);
  if (q.get('unlock')) {
    noSave = true;
    save.cleared = D.STAGES.length; save.hardCleared = D.STAGES.length; save.xp = Math.max(save.xp, 999999);
    save.tuna = Math.max(save.tuna, 99999); save.parts = Math.max(save.parts, 99999);
    D.UNITS.forEach((u) => { if (u.rank !== 'SS') save.owned[u.id] = 1; });
  }
  if (q.get('stage')) {
    const v = q.get('stage');
    const st = /^∞?\d+$/.test(v) && v.startsWith('∞') ? D.infiniteFloor(+v.slice(1))
      : D.STAGES.find((s) => s.code === v) || D.HARD.find((s) => s.code === v) || D.STAGES[Math.max(0, Math.min(D.STAGES.length - 1, +v - 1))];
    launch(st);
  }
  window.APP = { save, launch, openLobby, pull, playStory, pickBuff, openDaily, titleCard, fitHud, tutorial: () => !!tut };
  if (q.get('smoke')) { const sc = document.createElement('script'); sc.src = 'tools/smoke.js'; document.head.appendChild(sc); }
})();
