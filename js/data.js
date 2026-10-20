// Game data: deployable units, enemies, stages.
// Every unit / enemy id is an SD rig built by tools/build_sd.py (js/sd/<id>.js) from E:/LAO_Google_QA.
(function () {
  // Units are made from a weapon template (stats at rank B) scaled by rank, then per-unit tweaks.
  // cost: deploy cost, cd: deploy cooldown (s), hp, atk (per attack), rate: seconds between attack starts,
  // range: reach in front of the unit, spd: walk speed, kb: knockbacks over its life, area: hits every target in reach,
  // slow: [share, seconds] on hit (share 1 = stun), skill: every n-th attack plays the original skill clip (x2.6, area)
  const TYPES = {
    wall: { role: '방벽', cost: 90, cd: 2.4, hp: 620, atk: 7, rate: 0.9, range: 1.9, spd: 1.1, kb: 1 },
    single: { role: '사격', cost: 60, cd: 2.0, hp: 200, atk: 20, rate: 1.1, range: 2.6, spd: 1.4, kb: 3 },
    snipe: { role: '저격', cost: 200, cd: 6, hp: 240, atk: 120, rate: 2.4, range: 5.0, spd: 1.0, kb: 3 },
    splash: { role: '포격 범위', cost: 160, cd: 5, hp: 320, atk: 55, rate: 1.9, range: 3.3, spd: 1.0, kb: 3, area: 1 },
    melee: { role: '근접 범위', cost: 220, cd: 6, hp: 760, atk: 30, rate: 0.5, range: 1.9, spd: 1.3, kb: 2, area: 1 },
    slow: { role: '둔화 지원', cost: 200, cd: 7, hp: 340, atk: 50, rate: 1.5, range: 3.6, spd: 1.1, kb: 3, area: 1, slow: [0.4, 2.0] },
    stun: { role: '기절 지원', cost: 240, cd: 8, hp: 380, atk: 45, rate: 1.8, range: 3.6, spd: 1.1, kb: 3, area: 1, slow: [1, 0.7] },
    chain: { role: '전격 범위', cost: 220, cd: 7, hp: 360, atk: 60, rate: 1.6, range: 3.8, spd: 1.0, kb: 3, area: 1 },
    laser: { role: '관통 레이저', cost: 320, cd: 9, hp: 600, atk: 120, rate: 2.3, range: 4.4, spd: 1.0, kb: 2, area: 1 },
  };
  // hp / atk, cost, cooldown and extra reach per rank
  const RANKS = {
    B: { k: 1, c: 1, cd: 1, r: 0, color: '#9fb4cc' },
    A: { k: 1.8, c: 1.6, cd: 1.4, r: 0.2, color: '#5dd2ff' },
    S: { k: 3.2, c: 2.4, cd: 2.0, r: 0.4, color: '#c879ff' },
    SS: { k: 5.5, c: 4.0, cd: 3.0, r: 0.6, color: '#ffb52e' },
  };
  const RANK_ORDER = ['B', 'A', 'S', 'SS'];
  // [id, name, rank, type, fx, color, sfx, desc, tweaks]; tweaks multiply hp / atk / spd / rate, add range, set skill / slow
  const LIST = [
    ['brownie', '브라우니', 'B', 'single', 'bullet', 0xffe08a, 'rifle', '싸고 빠르게 뽑는 돌격소총병 분대', { cost: 50 / 60, spd: 1.07, multi: 3, hp: 0.5, atk: 0.5 }],
    ['leprechaun', '레프리콘', 'B', 'single', 'bullet', 0x9dff7a, 'mg', '기관총 연사로 전열의 적을 갈아내는 공격기', { rate: 0.8, hp: 1.3 }],
    ['gnome', '노움', 'B', 'wall', 'grenade', 0xffa040, 'cannon', '발포 콘크리트 탄으로 전열을 막아서는 보호기'],
    ['impet', '임펫', 'B', 'splash', 'grenade', 0xff6a2a, 'cannon', '포탄을 퍼부어 뭉친 적을 날려 버리는 폭파병'],
    ['daphne', '다프네', 'B', 'slow', 'wave', 0x9dffc8, 'laser', '음파로 적을 25% 느리게', { slow: [0.25, 1.6], cost: 0.8, multi: 2, hp: 0.6, atk: 0.6 }],
    ['banshee', '밴시', 'A', 'splash', 'wave', 0x7affd4, 'laser', '음파 폭격으로 무리를 휩쓰는 공격기'],
    ['sylphid', '실피드', 'A', 'single', 'bullet', 0xd78bff, 'gun', '적을 지나쳐 요새만 사격하는 고속 공격기', { spd: 1.6, range: -0.4, hp: 2.5, siege: 4 }],
    ['raven', '레이븐', 'A', 'slow', 'snipe', 0xfff2b0, 'handgun', '포격으로 적의 발을 묶는 지원기', { range: 0.6 }],
    ['nymph', '님프', 'A', 'single', 'frost', 0x6fe3ff, 'laser', '정찰 편대로 냉기탄을 연사하는 공격기', { multi: 2, hp: 0.6, atk: 0.6 }],
    ['amy', '에이미 레이저', 'A', 'snipe', 'snipe', 0xd9ff8a, 'handgun', '연속 저격 탄막', { rate: 0.8, atk: 0.8 }],
    ['andvari', '안드바리', 'A', 'stun', 'grenade', 0xffc070, 'cannon', '기지 앞에 자리 잡고 포격으로 적을 멈추는 지원기', { range: 7.4, hp: 2.2, tower: 1 }],
    ['phoenix', '피닉스', 'S', 'splash', 'fireball', 0xff5a1f, 'expS', '화염탄 범위 폭격'],
    ['thetis', '테티스', 'S', 'chain', 'lightning', 0x66ccff, 'elec', '전격으로 무리를 꿰뚫음'],
    ['hraesvelgr', '흐레스벨그', 'S', 'stun', 'laser', 0x9ab8ff, 'laserBig', '느리게 전진하며 레이저로 적을 마비시키는 지원기', { range: 2.6, hp: 2.5, spd: 0.4, ship: 1 }],
    ['undine', '운디네', 'S', 'wall', 'frost', 0x9feaff, 'ice', '하늘에서 전열을 지키는 보호기'],
    ['valkyrie', '발키리', 'S', 'single', 'bullet', 0x9fd0ff, 'rifle', '빠른 발로 공격을 흘려 내는 연사형', { spd: 1.7, rate: 0.65, hp: 1.2, cost: 2.4, cd: 2, evade: 0.6 }],
    // SS: gacha only
    ['zero', '쿠노이치 제로', 'SS', 'melee', 'slash', 0xff3b6b, 'slash', '공격을 피하며 파고드는 연속 베기', { spd: 1.6, rate: 0.8, skill: 4, evade: 0.7 }],
    ['hela', '헬라', 'SS', 'chain', 'lightning', 0xc77dff, 'elec', 'AGS 잔해를 조종하는 버뮤다 팀의 지원기', { skill: 3 }],
    ['azazel', '아자젤', 'SS', 'wall', 'holy', 0xffe9a0, 'energy', '빛의 방벽으로 아군을 지키는 보호기', { skill: 3 }],
    ['saraqael', '사라카엘', 'SS', 'wall', 'wave', 0xb28cff, 'energy', '율법의 방패로 전열을 지키는 보호기', { skill: 3 }],
    ['leona', '철혈의 레오나', 'SS', 'stun', 'laser', 0xff9ad5, 'laserBig', '드론 사격으로 적을 묶는 지원기', { hp: 1.4, skill: 4 }],
    ['ullr', '우르', 'SS', 'laser', 'laser', 0x7fe8ff, 'laserBig', '초장거리 정밀 레이저', { range: 1.2, hp: 0.8, skill: 3 }],
    ['harpy', '하르페이아', 'SS', 'splash', 'missile', 0xff8a3d, 'missile', '적을 넘어 요새에 미사일을 쏟는 폭격기', { range: 1.0, skill: 3, siege: 2.5 }],
    ['eternity', '이터니티', 'SS', 'wall', 'bullet', 0xffd98a, 'mg', '기지 앞에 버티고 서서 기관포를 쏘는 보호기', { hp: 1.6, atk: 2, range: 8.5, skill: 3, tower: 1 }],
    ['lemonadealpha', '레모네이드 알파', 'SS', 'chain', 'lightning', 0xffe14d, 'elec', '전장을 가르는 전격', { range: 0.8, skill: 3 }],
    ['sleipnir', '슬레이프니르', 'SS', 'wall', 'missile', 0xffb070, 'missile', '고속으로 전열에 끼어들어 막는 보호기', { spd: 1.6, skill: 3 }],
    ['blacklilith', '블랙 리리스', 'SS', 'melee', 'slash', 0xd0405a, 'slash', '거대한 낫의 학살', { atk: 1.2, skill: 3 }],
    ['cyclopsprincess', '사이클롭스 프린세스', 'SS', 'stun', 'slash', 0xff3a5a, 'slash', '안대를 풀어 적을 얼어붙게 하는 지원기', { hp: 1.3, skill: 3 }],
    ['blindprincess', '블라인드 프린세스', 'SS', 'melee', 'holy', 0xfff1b8, 'energy', '빛의 대검으로 앞을 베어 내는 검사', { skill: 3 }],
    ['brunhild', '브륀힐드', 'SS', 'splash', 'fireball', 0xff5530, 'expM', '화염의 대검이 전장을 태움', { hp: 1.4, atk: 1.15, skill: 3 }],
    ['tiamat', '티아멧', 'SS', 'laser', 'laser', 0x6ef0ff, 'laserBig', '전장 끝까지 닿는 대구경 레이저', { range: 1.6, atk: 1.2, skill: 3 }],
    ['khan', '신속의 칸', 'SS', 'snipe', 'snipe', 0xffcf7a, 'rifle', '번개 같은 속사 저격', { rate: 0.6, atk: 0.75, spd: 1.8, skill: 3 }],
    ['labiata', '라비아타 프로토타입', 'SS', 'melee', 'slash', 0xffd36e, 'swing', '바이오로이드의 원점. 「백화요란」', { hp: 1.5, atk: 1.3, skill: 3 }],
    ['lrl', 'LRL', 'SS', 'slow', 'holy', 0xb46bff, 'energy', '칠흑의 마법으로 적을 느리게 하는 지원기', { range: 1.0, skill: 3 }],
    ['constantia', '콘스탄챠 S2', 'SS', 'slow', 'laser', 0xff6af0, 'laserBig', '느리게 전진하며 함포로 적을 묶는 지원기', { range: 2.5, hp: 2.5, spd: 0.35, skill: 3, ship: 1 }],
    ['titania', '티타니아 프로스트', 'SS', 'splash', 'frost', 0xaef4ff, 'ice', '광역 빙결 폭발로 무리를 부수는 공격기', { range: 1.0, skill: 3 }],
    ['mercury', '프랭스터 머큐리', 'SS', 'stun', 'slash', 0x7dffb0, 'slash', '초고속 연타로 적을 멈추고 공격을 피하는 지원기', { spd: 1.8, skill: 4, evade: 0.6 }],
    ['empress', '엠프리스', 'SS', 'splash', 'missile', 0x9fe6ff, 'expM', '느리게 전진하며 빙결 미사일을 퍼붓는 공격기', { range: 2.9, hp: 2.5, spd: 0.35, slow: [0.3, 1.5], skill: 3, ship: 1 }],
    ['fafnir', '파프니르', 'SS', 'chain', 'lightning', 0x5aa8ff, 'elec', '주피터로 생체 전기를 증폭하는 공작원', { hp: 1.5, range: 1.0, skill: 3 }],
    ['ramiel', '라미엘', 'SS', 'splash', 'holy', 0xfff1b8, 'energy', '천벌의 빛을 터뜨리는 공격기', { range: 1.0, atk: 1.2, skill: 3 }],
  ];
  // balance pass (tools/balance.js): hp and attack x this, so units of a rank return about the same per money spent
  const TUNE = {banshee: 0.84, nymph: 1.46, daphne: 1.03, impet: 1.11, leprechaun: 1.14, valkyrie: 0.87, undine: 0.87, hraesvelgr: 1.98, khan: 0.53, tiamat: 0.3, ullr: 0.41, zero: 1.39, brunhild: 0.66, titania: 0.82, ramiel: 0.79, leona: 1.07, mercury: 1.24, empress: 1.11, cyclopsprincess: 1.15, fafnir: 1.68, blacklilith: 2.3, saraqael: 1.83, azazel: 2.07, labiata: 2.56, sleipnir: 2.08, sylphid: 1.69, andvari: 0.42, eternity: 12.03, harpy: 0.95, constantia: 0.87, lrl: 1.18, blindprincess: 2.76};
  // the starting squad, and the unit each stage hands out on its first clear (stage index -> id)
  const STARTERS = ['brownie', 'leprechaun', 'gnome'];
  const STAGE_REWARD = ['impet', 'nymph', 'valkyrie', 'raven', 'undine', 'phoenix', 'thetis', 'hraesvelgr'];

  const r10 = (v) => Math.max(10, Math.round(v / 10) * 10);
  // what a unit is for (the squad screen, tools/balance.js): every role has units at more than one rank
  const ROLES = {
    single: '단일 공격', area: '범위 공격', tank: '체력 탱커', swarm: '물량 탱커', evade: '회피 탱커',
    siege: '요새 공격', ship: '전투함', tower: '방어 타워', multi: '다수 배치', control: '둔화 · 기절',
  };
  function roleTags(u, t) {
    const r = [u.area ? 'area' : 'single'];
    if (t === 'wall' || u.ship || u.tower) r.push('tank');
    if (u.multi > 1) r.push('multi', 'swarm');
    if (u.evade) r.push('evade');
    if (u.siege) r.push('siege');
    if (u.ship) r.push('ship');
    if (u.tower) r.push('tower');
    if (u.slow) r.push('control');
    return r;
  }
  // 기동형 (the original's Mobility class) fly over the lane: short-range enemies (melee / walls) cannot hit them
  // (the dodgers Zero and Mercury fight on the ground: their evasion is how they hold the line)
  const FLYERS = new Set(['impet', 'daphne', 'banshee', 'sylphid', 'raven', 'phoenix', 'thetis', 'hraesvelgr', 'undine',
    'azazel', 'saraqael', 'harpy', 'sleipnir', 'brunhild', 'tiamat', 'titania']);
  // reach by weapon and trait, not by template: blades and flamethrowers in hand's reach, walls just ahead of the line,
  // close-quarters guns (assault rifle, Valkyrie who closes in quietly) short, machine guns long, shells mid, missiles and
  // battleship guns far, snipers and lasers farthest, towers across the field (2.4 and above can hit flyers: ANTI_AIR)
  const RANGE = {
    zero: 1.4, blacklilith: 1.5, labiata: 1.8, valkyrie: 1.8, blindprincess: 1.9,
    gnome: 1.8, azazel: 1.9, saraqael: 1.9, sleipnir: 1.9, undine: 2.0, sylphid: 2.0,
    brownie: 2.4, nymph: 2.8, leprechaun: 3.2,
    daphne: 3.0, impet: 3.4, banshee: 3.6, thetis: 4.0, brunhild: 4.0, cyclopsprincess: 4.0, phoenix: 4.2, leona: 4.2, mercury: 4.2,
    raven: 4.6, hela: 4.6, titania: 4.8, lemonadealpha: 5.0, lrl: 5.0, fafnir: 5.0, ramiel: 5.0, harpy: 5.4,
    amy: 6.5, hraesvelgr: 6.6, constantia: 6.7, empress: 6.8, khan: 7.5, ullr: 8.0, tiamat: 8.0,
    eternity: 11.0, andvari: 11.2,
  };
  const UNITS = LIST.map(([id, name, rank, type, fx, color, sfx, desc, tw = {}]) => {
    if (FLYERS.has(id)) desc = '비행 · ' + desc;
    const t = TYPES[type], R = RANKS[rank];
    const u = {
      id, name, rank, type, role: t.role, fx, color, sfx, desc,
      cost: r10(t.cost * R.c * (tw.cost || 1)),
      cd: Math.min(45, Math.round(t.cd * R.cd * (tw.cd || 1) * 10) / 10),
      hp: Math.round(t.hp * R.k * (tw.hp || 1) * (TUNE[id] || 1)),
      atk: Math.round(t.atk * R.k * (tw.atk || 1) * (TUNE[id] || 1)),
      rate: Math.round(t.rate * (tw.rate || 1) * 100) / 100,
      range: RANGE[id] || Math.round((t.range + R.r + (tw.range || 0)) * 10) / 10,
      spd: Math.round(t.spd * (tw.spd || 1) * 100) / 100,
      kb: t.kb, area: t.area || 0,
      fly: FLYERS.has(id) ? 1 : 0,
      slow: tw.slow || t.slow || null,
      skill: tw.skill || 0, // S / SS: ordered by the player (game.js SKILL); others none
      // roles (ROLES): siege: x damage to the fortress and walks past the worms; ship: slow battleship (shrugs knockbacks);
      // tower: stands in front of our base and never moves; multi: copies per deploy; evade: share of hits dodged
      siege: tw.siege || 0, ship: tw.ship || 0, tower: tw.tower || 0, multi: tw.multi || 1, evade: tw.evade || 0,
      gacha: rank === 'SS' ? 1 : 0,
      legend: rank === 'SS' ? 1 : 0,
    };
    u.roles = roleTags(u, type);
    const tag = [u.siege && '요새 공격', u.ship && '전투함', u.tower && '방어 타워', u.multi > 1 && `${u.multi}기 배치`, u.evade && `회피 ${Math.round(u.evade * 100)}%`].filter(Boolean);
    if (tag.length) u.desc = tag.join(' · ') + ' · ' + u.desc;
    const st = STAGE_REWARD.indexOf(id);
    u.unlock = STARTERS.includes(id) ? 0 : st >= 0 ? st + 1 : -1; // -1: gacha only
    return u;
  });
  const UNIT = Object.fromEntries(UNITS.map((u) => [u.id, u]));

  // currencies: parts (부품, earned by every win) pay for the making (gacha); tuna (참치, first clears / records)
  // buys a chosen unit outright in the recruit shop.
  // gacha: rates per rank, a 10-pull guarantees S or better, and PITY pulls without the selected SS guarantee that unit.
  // The player selects any SS. Half of ordinary SS draws are that unit; 40 pulls guarantee it. Duplicates turn into card copies (PULL_CARDS).
  const GACHA = {
    cost1: 500, cost10: 5000, rates: { B: 0.47, A: 0.32, S: 0.18, SS: 0.03 }, pity: 40, featuredShare: 0.5,
    startParts: 10000, startTuna: 300, // the tutorial 10-pull spends 5000; after it (+1-1 reward, +1000 mission) the player holds 6150: one more 10-pull
  };
  const SHOP_PRICE = { B: 150, A: 400, S: 1000, SS: 3000 }; // tuna, recruit shop (a link for an owned unit)
  const SHOP_NEW_SS = 10000; // a new SS recruited outright costs double: the making stays the main way to meet SS

  // cards (as in Clash Royale): a unit's card level runs to 15 and starts by rank (B 1, A 3, S 6, SS 9).
  // Each upgrade spends copies of that card (from duplicate pulls, the shop, wild cards) and XP (the 'gold').
  // Battle power counts the levels gained above the starting level, so a fresh card of any rank fights as before.
  const START_LV = { B: 1, A: 3, S: 6, SS: 9 };
  // copies needed from level L to L+1, from the rank's starting level up (Clash Royale's quantities)
  const CARDS = {
    B: [2, 4, 10, 20, 50, 100, 200, 400, 800, 1000, 1500, 3000, 5000, 5000],
    A: [2, 4, 10, 20, 50, 100, 200, 400, 500, 750, 1250, 2500],
    S: [2, 4, 10, 20, 40, 50, 100, 200, 400],
    SS: [2, 4, 6, 10, 20, 40],
  };
  const cardsNeed = (rank, lv) => CARDS[rank][lv - START_LV[rank]] || 0; // 0 at the top
  const relLv = (rank, lv) => lv - START_LV[rank] + 1; // the battle level (1 = fresh card)
  // copies in one pull of a card you already have (chest-like bundles for the common ranks)
  const PULL_CARDS = { B: [20, 40], A: [6, 12], S: [1, 3], SS: [1, 1] };
  // wild cards: stand in for missing copies of any card of their rank
  const WILD_SHOP = { B: { n: 20, price: 200 }, A: { n: 5, price: 400 }, S: { n: 1, price: 600 }, SS: { n: 1, price: 2500 } };
  const SHOP_CARDS = { B: 20, A: 6, S: 2, SS: 1 }; // copies per recruit-shop buy of a card you own

  // formation cost: the squad's ranks must add up to DECK_CAP or less (an all-SS squad does not fit)
  const DECK_COST = { B: 1, A: 2, S: 4, SS: 8 };
  const DECK_CAP = 30;

  // money: reward when it falls
  const ENEMIES = {
    NightChick_N: { name: '나이트 칙', hp: 110, atk: 9, rate: 1.2, range: 1.2, spd: 1.5, kb: 2, h: 1.0, money: 18, color: 0xff8855 },
    Legion_N: { name: '레기온', hp: 280, atk: 20, rate: 1.4, range: 1.8, spd: 1.0, kb: 2, h: 1.45, money: 40, color: 0xff5555 },
    Drone_N: { name: '드론', hp: 150, atk: 14, rate: 1.0, range: 3.0, spd: 2.0, kb: 1, h: 1.1, fly: 1, dive: 1, traits: ['fly', 'dive'], money: 30, color: 0xffaa33 },
    Fallen_N: { name: '폴른', hp: 520, atk: 34, rate: 1.3, range: 1.5, spd: 1.3, kb: 2, h: 1.5, money: 70, color: 0xff4466 },
    Centurion_N: { name: '센츄리온', shield: 0.35, traits: ['shield'], hp: 820, atk: 52, rate: 1.6, range: 2.3, spd: 0.9, kb: 2, h: 1.6, money: 110, color: 0xff6644 },
    Intruder_N: { name: '인트루더', fly: 1, traits: ['fly'], hp: 520, atk: 70, rate: 2.0, range: 3.8, spd: 1.1, kb: 2, area: 1, h: 1.5, money: 120, color: 0xffcc44 },
    Phalangites_N: { name: '팔랑기테스', artillery: 1, traits: ['artillery'], hp: 1100, atk: 64, rate: 2.2, range: 4.8, spd: 0.9, kb: 2, area: 1, h: 1.6, money: 160, color: 0xff7744 },
    Rampart_N: { name: '램파트', armor: 1, traits: ['armor'], hp: 3600, atk: 40, rate: 1.8, range: 1.6, spd: 0.6, kb: 1, h: 1.8, money: 220, color: 0xff9966 },
    Juggernaut_N: { name: '저거너트', armor: 1, traits: ['armor'], hp: 3000, atk: 170, rate: 2.4, range: 2.0, spd: 0.8, kb: 2, area: 1, h: 2.0, money: 280, color: 0xff3322 },
    BigChick_N: { name: '빅 칙', hp: 2400, atk: 90, rate: 2.0, range: 2.0, spd: 0.9, kb: 2, area: 1, h: 2.1, money: 260, color: 0xff8844 },
    Gigantes_N: { name: '기간테스', armor: 1, traits: ['armor'], hp: 6500, atk: 260, rate: 2.8, range: 2.6, spd: 0.7, kb: 2, area: 1, h: 2.5, money: 450, color: 0xff3333 },
    Destroyer_N: { name: '디스트로이어', artillery: 1, traits: ['artillery', 'armor'], armor: 1, hp: 2600, atk: 240, rate: 3.0, range: 5.6, spd: 0.7, kb: 3, area: 1, h: 2.0, money: 500, color: 0xff2266 },
    // roles' counterparts (original monsters): a sniper that one-shots the front, a runner that slips past the line to our
    // base, a speaker that heals the worms around it
    Scout_N: { name: '스카우트', rush: 1, traits: ['rush'], hp: 260, atk: 30, rate: 1.0, range: 1.4, spd: 3.0, kb: 1, h: 1.2, money: 60, color: 0xffd060 },
    Speaker_N: { name: '스피커', heal: [0.05, 3, 3.6], traits: ['heal'], hp: 700, atk: 15, rate: 1.5, range: 3.2, spd: 0.8, kb: 2, h: 1.4, money: 140, color: 0x80ffb0 },
    Stalker_EW: { name: '스토커', traits: ['sniper'], hp: 900, atk: 220, rate: 4.0, range: 8.6, spd: 0.7, kb: 2, h: 1.7, money: 180, color: 0xff6040 },
    // bosses
    EmperorChick_N: { name: '엠페러 칙', hp: 16000, atk: 220, rate: 2.4, range: 3.2, spd: 0.6, kb: 3, area: 1, h: 3.0, money: 1500, boss: 1, color: 0xffaa22 },
    Executioner_EW: { name: '엑스큐셔너', armor: 1, traits: ['armor'], hp: 34000, atk: 480, rate: 2.6, range: 3.6, spd: 0.6, kb: 3, area: 1, h: 3.2, money: 2500, boss: 1, color: 0xff2244 },
    // the last boss: a scripted four-phase fight (js/game.js dreadStep); kb 1: its phases replace the HP knockbacks
    Dreadlurker_BOSS_IW_N: { name: '드레드러커', ai: 'dread', traits: ['phase'], hp: 56000, atk: 650, rate: 3.0, range: 3.4, spd: 0.6, kb: 1, area: 1, h: 3.6, money: 5000, boss: 1, color: 0xc040ff },
  };
  // enemy traits (shown on the stage sheet): what they ask of the squad
  const TRAITS = {
    fly: { name: '비행', tip: '방벽·근접(사거리 2.4 미만)은 공격 불가 · 대공 대원 필요' },
    dive: { name: '돌파', tip: '공격할 수 없는 대원은 넘어서 기지로 날아감' },
    armor: { name: '장갑', tip: '범위 공격 피해 50% · 저격은 150%' },
    shield: { name: '보호막', tip: '체력 일부만큼 보호막을 먼저 깎아야 함' },
    artillery: { name: '포격', tip: '사거리 2배 거리에서 기지를 포격(피해 50%) · 빨리 처치해야 함' },
    rush: { name: '돌격', tip: '빠르게 전열을 지나쳐 기지만 노림 · 방어 타워 · 후방 범위 공격이 유리' },
    heal: { name: '회복', tip: '주변 철충의 체력을 주기적으로 회복 · 단일 화력으로 먼저 제거' },
    sniper: { name: '저격', tip: '사거리 6.5에서 맨 앞 대원에게 큰 단발 피해 · 값싼 대원으로 탄을 받아내면 유리' },
    phase: { name: '4단계', tip: '체력 75·50·25%에서 형태와 공격이 바뀜 · 붉은 예고 범위를 피하고, 예고 중 오르카 포격을 맞히면 공격을 끊음' },
  };
  const BASE_RIG = 'Nest_B07'; // the enemy base: the Iron Worm nest (Nest_B07), standing still

  // ── campaign: 8 chapters x 10 stages; the 5th stage brings an elite (mid-boss), the 10th the chapter boss ──
  // pool: the chapter's worms, weakest first (the first two come endlessly, the rest in limited numbers)
  // boss: [enemy, strength]; reward: the unit that joins on the chapter's first clear; story: js/story.js
  const CHAPTERS = [
    { title: '좌초', sub: '동쪽 해안', bg: 'bg_field', pool: ['NightChick_N', 'Legion_N', 'Drone_N'], boss: ['BigChick_N', 0.8],
      stages: ['좌초 지점', '모래톱 방어선', '등대 언덕', '갯바위 돌파', '첫 번째 그림자', '젖은 숲길', '버려진 어촌', '신호탄의 주인', '등대 점화', '거대 개체 「빅 칙」'] },
    { title: '잿빛 변전소', sub: '폐허 도시', bg: 'bg_city', pool: ['NightChick_N', 'Drone_N', 'Legion_N', 'Fallen_N', 'Scout_N'], boss: ['EmperorChick_N', 0.7],
      stages: ['무너진 대로', '빈 시장 거리', '지하 차도', '고압선 아래', '상공의 감시자', '고가 철로', '잠든 변전소', '차단기 탈환', '둥지의 중심', '군주 「엠페러 칙」'] },
    { title: '증폭탑 강습', sub: '철충 전진 거점', bg: 'bg_base', pool: ['Legion_N', 'Fallen_N', 'Drone_N', 'Centurion_N', 'Speaker_N'], boss: ['Gigantes_N', 1.0],
      stages: ['외곽 감시선', '격납고 진입', '보급 라인 절단', '경비 순찰로', '철문 앞의 백부장', '탄약고 폭파', '제어실 확보', '냉각 구역', '증폭탑 기부', '수문장 「기간테스」'] },
    { title: '처형인의 사냥터', sub: '사냥 구역', bg: 'bg_base', pool: ['Fallen_N', 'Centurion_N', 'Intruder_N', 'Legion_N', 'Stalker_EW'], boss: ['Executioner_EW', 0.6],
      stages: ['불 꺼진 해안', '사냥꾼의 발자국', '추적자들', '어둠 속의 침입자', '사냥꾼의 그물', '지하 수로', '저격수의 둥지', '무너진 등대', '최후의 문', '처형인 「엑스큐셔너」'] },
    { title: '포화의 시가지', sub: '회색 시가지', bg: 'bg_city', pool: ['Centurion_N', 'Intruder_N', 'Phalangites_N', 'Rampart_N', 'Stalker_EW', 'Scout_N'], boss: ['Gigantes_N', 1.4],
      stages: ['포격 지대', '방벽 너머', '저격수의 거리', '광장 공방전', '움직이는 성벽', '폐허 아케이드', '송신탑 오르막', '철벽 돌파', '두 번째 불', '강철 행렬'] },
    { title: '불길 속의 날개', sub: '불타는 평원', bg: 'bg_field', pool: ['Fallen_N', 'Intruder_N', 'Juggernaut_N', 'BigChick_N', 'Phalangites_N', 'Scout_N', 'Speaker_N'], boss: ['EmperorChick_N', 1.3],
      stages: ['불붙은 들판', '연기 속의 행군', '연료 저장소', '타오르는 숲', '저거너트 진군로', '붉은 강', '검게 탄 마을', '불새의 비행', '열기의 장벽', '불사의 군주'] },
    { title: '거인의 길', sub: '중장갑 회랑', bg: 'bg_field', pool: ['Centurion_N', 'Phalangites_N', 'Rampart_N', 'Gigantes_N', 'Destroyer_N', 'Stalker_EW', 'Speaker_N'], boss: ['Executioner_EW', 0.8],
      stages: ['거인의 발자국', '무너진 고가도로', '포대 협곡', '강철 숲', '거인의 그림자', '파괴자의 사선', '철골 다리', '회랑 입구', '조선소가 보이는 언덕', '처형인의 귀환'] },
    { title: '옛 조선소', sub: '해군 조선소', bg: 'bg_base', pool: ['Centurion_N', 'Fallen_N', 'Juggernaut_N', 'Destroyer_N', 'Gigantes_N', 'Stalker_EW', 'Scout_N', 'Speaker_N'], boss: ['Dreadlurker_BOSS_IW_N', 1.0],
      stages: ['조선소 외곽', '녹슨 크레인', '건조 도크', '관제탑 아래', '수문 경비대', '잠긴 창고', '방파제 길', '수문 개방', '부두 끝', '「드레드러커」'] },
  ];
  // stage conditions, hand-placed per chapter (CHAPTER_MODS): each changes how a stage has to be played
  const MODS = {
    swarm: { name: '대군', tip: '약한 철충이 쉴 새 없이 몰려옴 · 범위 공격이 유리' },
    air: { name: '공습', tip: '비행 개체 다수 · 사거리 2.4 이상 대원 필요' },
    armor: { name: '중장갑', tip: '장갑 개체 출현 · 저격 · 단일 화력이 유리' },
    blitz: { name: '기습', tip: '시작과 동시에 돌격 · 적 이동 속도 +25%' },
    siege: { name: '포위전', tip: '요새 체력 1.5배 · 적 출현은 느림 · 보상 1.3배' },
    emp: { name: 'EMP', tip: '오르카 포격 충전 속도 40%' },
    poor: { name: '보급 차단', tip: '전력 충전 -25%' },
    rich: { name: '보급 지원', tip: '시작 전력 500 · 적 강도 +10%' },
  };
  const CHAPTER_MODS = [
    ['', '', 'swarm', '', '', 'air', 'rich', '', 'swarm', ''],
    ['', 'air', '', 'blitz', '', '', 'swarm', 'emp', 'air', ''],
    ['', 'armor', '', 'poor', '', 'blitz', '', 'siege', 'armor', ''],
    ['', 'blitz', 'swarm', '', '', 'emp', 'air', '', 'poor', ''],
    ['', 'siege', 'armor', 'air', '', '', 'emp', 'swarm', 'blitz', ''],
    ['', 'swarm', 'blitz', 'poor', '', 'armor', '', 'air', 'siege', ''],
    ['', 'armor', 'siege', 'emp', '', 'blitz', 'swarm', 'poor', 'air', ''],
    ['', 'blitz', 'armor', 'air', '', 'emp', 'siege', 'swarm', 'poor', ''],
  ];
  // the chapter's armoured / flying worm for those conditions
  const pickTrait = (pool, c, t) => pool.find((e) => (ENEMIES[e].traits || []).includes(t)) ||
    (t === 'fly' ? (c >= 3 ? 'Intruder_N' : 'Drone_N') : (c >= 5 ? 'Juggernaut_N' : 'Rampart_N'));
  function applyMod(st, mod, ch, c, s) {
    if (!mod) return;
    st.mod = mod;
    const sp = st.spawns;
    if (mod === 'swarm') { sp[0] = [sp[0][0], 1, sp[0][2] * 0.45, 0, 0.8]; st.rush.at = 0.7; }
    if (mod === 'air') sp.push([pickTrait(ch.pool, c, 'fly'), 6, 9, 0, 1]);
    if (mod === 'armor') sp.push([pickTrait(ch.pool, c, 'armor'), 18, 30, 2 + Math.floor(s / 4), 1]);
    if (mod === 'blitz') { sp.push([sp[0][0], 0, 0.8, 5, 1]); st.enemySpd = 1.25; }
    if (mod === 'siege') { st.baseHp = Math.round(st.baseHp * 1.5 / 100) * 100; sp.forEach((x) => { x[2] *= 1.2; }); st.xp = Math.round(st.xp * 1.3); st.bonus = 1.3; }
    if (mod === 'emp') { st.cannonK = 0.4; st.pow = Math.round(st.pow * 0.85 * 100) / 100; }
    if (mod === 'poor') st.incomeK = 0.75;
    if (mod === 'rich') { st.startMoney = 500; st.pow = Math.round(st.pow * 1.1 * 100) / 100; }
  }

  // seconds between spawns for each worm (before the stage's own pacing)
  const EVERY = { NightChick_N: 5, Legion_N: 9, Drone_N: 11, Fallen_N: 8, Centurion_N: 10, Intruder_N: 14, Phalangites_N: 18,
    Rampart_N: 26, Juggernaut_N: 26, BigChick_N: 24, Gigantes_N: 40, Destroyer_N: 45, Scout_N: 7, Speaker_N: 20, Stalker_EW: 22 };
  const PER_CH = 10;
  const MID = 4; // index of the elite stage in a chapter
  // difficulty pass (tools/balance.js calibrate): worm strength and fortress HP x this per stage, so the squad the
  // economy gives you clears each stage comfortably and one two levels under it only just
  const DIFF = [1.5, 3.94, 3.94, 3.92, 3.9, 3.7, 3.5, 3.47, 3.45, 3.42, 9.82, 9.57, 9.31, 7.44, 5.78, 7.15, 8.66, 7.65, 6.63, 5.62, 8.48, 7.08, 5.62, 5.54, 5.43, 5.74, 6.04, 5.44, 4.86, 4.32, 4.46, 3.2, 2.13, 2.65, 3.16, 2.62, 2.13, 2.22, 1.84, 1.68, 2.12, 2.02, 2.05, 1.95, 1.84, 1.58, 1.31, 1.37, 1.67, 1.77, 2.12, 1.53, 1, 1.22, 1.33, 1.41, 1.41, 1.44, 1.47, 1.49, 1.5, 1.51, 1.51, 1.28, 1.06, 0.97, 0.88, 0.95, 0.92, 0.88, 2.02, 1.68, 1.33, 1.32, 1.31, 1.16, 1.15, 1.05, 0.9, 0.8];

  // spawns: [enemy, first spawn (s), every (s), how many (0 = endless), strength x]
  // pow: every enemy's HP / attack in this stage; rush: spawns that start once the base falls below `at` of its HP;
  // boss: appears at that HP with a shockwave
  const STAGES = [];
  CHAPTERS.forEach((ch, c) => {
    ch.no = c + 1;
    ch.first = c * PER_CH;
    ch.stages.forEach((name, s) => {
      const g = c * PER_CH + s, last = s === PER_CH - 1;
      const pow = Math.round((1 + 3.0 * Math.pow(g / (CHAPTERS.length * PER_CH - 1), 0.75)) * 100) / 100;
      const types = Math.min(ch.pool.length, 2 + Math.round((s * (ch.pool.length - 2)) / (PER_CH - 2)));
      const spawns = ch.pool.slice(0, types).map((e, i) => [e, 2 + i * 9, EVERY[e] * (i < 2 ? 1 : 1.2), i < 2 ? 0 : 1 + Math.floor(s / 3), 1]);
      const st = {
        ix: g, chapter: c, no: s + 1, code: `${c + 1}-${s + 1}`, name, bg: ch.bg, last,
        len: Math.min(32, 24 + c + (last ? 2 : 0)), pow,
        baseHp: Math.round((1200 + g * 220) * (last ? 1.3 : 1) / 100) * 100,
        xp: 180 + g * 54,
        spawns,
        rush: { at: 0.5, spawns: [[ch.pool[0], 0, 2.5, 6, 1.2], [ch.pool[Math.min(types, ch.pool.length) - 1], 0, 12, 2, 1]] },
      };
      applyMod(st, CHAPTER_MODS[c][s], ch, c, s);
      const k = DIFF[g] || 1;
      st.pow = Math.round(st.pow * k * 100) / 100; st.baseHp = Math.round(st.baseHp * k / 100) * 100;
      if (last) st.boss = { e: ch.boss[0], at: 0.95, mag: ch.boss[1] };
      else if (s === MID) { st.boss = { e: [...ch.pool].sort((a, b) => ENEMIES[b].hp - ENEMIES[a].hp)[0], at: 0.8, mag: 1.7 }; st.elite = true; }
      st.sub = last ? `보스: ${ENEMIES[ch.boss[0]].name}` : st.elite ? `정예: ${ENEMIES[st.boss.e].name}` : ch.pool.slice(0, types).map((e) => ENEMIES[e].name).join(' · ');
      STAGES.push(st);
    });
  });
  // the unit each chapter hands out on its first clear
  const CHAPTER_REWARD = STAGE_REWARD;

  // worker (income) levels: money per second and wallet size; cost of the next level
  const WORKER = { rate: [24, 32, 40, 48, 56, 64, 72, 80], cap: [600, 900, 1200, 1500, 1800, 2200, 2600, 3000], cost: [80, 160, 240, 320, 400, 480, 560] };
  const CANNON = { charge: 22, reach: 15, dmg: 300 }; // damage x the stage's pow
  const MAX_LV = 15; // card level cap
  const lvMul = (lv) => 1 + 0.2 * (lv - 1); // hp / atk at battle level lv (levels above the card's start, 1-based)
  const lvCost = (lv) => Math.round(150 * Math.pow(lv, 1.9) / 50) * 50; // xp from battle level lv to lv + 1
  const xpNeed = (rank, lv) => lvCost(relLv(rank, lv)); // XP for a card's next level

  // ── after the campaign ──
  // hard: every campaign stage again, much stronger worms (opens per chapter once its normal 10 stages are cleared)
  STAGES[STAGES.length - 1].finale = true; // the war's last battle ends with its own sequence (game.js finale)
  const HARD = STAGES.map((st) => Object.assign({}, st, {
    // (the first two chapters' normal stages are eased for newcomers: their hard versions climb further)
    hard: true, finale: false, ix: st.ix, code: 'H' + st.code, pow: Math.round((st.pow * (st.chapter < 2 ? 3 : 1.8) + 1.0) * 100) / 100,
    baseHp: Math.round(st.baseHp * 1.5 / 100) * 100, xp: Math.round(st.xp * 2.4), // hard levels the squad for H8 in about 3-4 weeks
    spawns: st.spawns.map((x) => (x[3] ? [x[0], x[1], x[2], x[3] + 1, x[4]] : x)),
    boss: st.boss && Object.assign({}, st.boss, { mag: st.boss.mag * 1.2 }),
  }));
  // infinite front: floor n (1, 2, ...) cycles the chapters' worms, every 5th floor brings a chapter boss
  function infiniteFloor(n) {
    const ci = Math.min(CHAPTERS.length - 1, Math.floor((n - 1) / 3)); // later chapters' worms as the floors climb
    const ch = CHAPTERS[ci];
    const spawns = ch.pool.map((e, i) => [e, 2 + i * 7, EVERY[e] * (i < 2 ? 0.9 : 1.1), i < 2 ? 0 : 2 + Math.floor(n / 6), 1]);
    const st = {
      infinite: true, floor: n, ix: -n, chapter: ci, code: `∞${n}`, name: `무한 전장 ${n}층`, bg: ch.bg,
      len: 32, pow: Math.round((4.0 + 0.35 * n) * 100) / 100, baseHp: 20000 + 2500 * n, xp: 3000 + 400 * n, spawns,
      rush: { at: 0.5, spawns: [[ch.pool[0], 0, 2, 8, 1.2], [ch.pool[ch.pool.length - 1], 0, 10, 2 + Math.floor(n / 5), 1]] },
      last: n % 5 === 0,
    };
    if (st.last) st.boss = { e: ch.boss[0], at: 0.95, mag: Math.min(ch.boss[1], 0.9) * (1 + 0.04 * n) };
    st.sub = st.last ? `보스: ${ENEMIES[ch.boss[0]].name}` : ch.pool.map((e) => ENEMIES[e].name).join(' · ');
    return st;
  }

  // infinite front: after each floor the player keeps one of three buffs for the run (lost on defeat)
  const INF_BUFFS = [
    { id: 'atk', name: '화력 증강', tip: '아군 공격 +12%' },
    { id: 'hp', name: '장갑 보강', tip: '아군 체력 +15%' },
    { id: 'money', name: '보급 선적', tip: '시작 전력 +300' },
    { id: 'income', name: '생산 라인', tip: '전력 충전 +15%' },
    { id: 'cannon', name: '포격 개량', tip: '오르카 포격 충전 -20%' },
    { id: 'cd', name: '긴급 출격', tip: '재배치 시간 -12%' },
  ];

  // daily operation: one stage a day (seeded by the date) with a fixed squad and a condition; pays once a day
  // top: how far the campaign reached when the day's operation was first opened (frozen for that day)
  function dailyStage(day, top0) {
    let r = (day * 2654435761) >>> 0; // mulberry32 seeded by the day
    const rnd = () => { r = (r + 0x6d2b79f5) >>> 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const top = Math.max(1, Math.min(STAGES.length, top0));
    const base = STAGES[Math.floor(rnd() * top)];
    const mods = Object.keys(MODS);
    const st = Object.assign({}, base, { spawns: base.spawns.map((x) => x.slice()), rush: { at: base.rush.at, spawns: base.rush.spawns.map((x) => x.slice()) } });
    delete st.finale; delete st.mod; delete st.cannonK; delete st.incomeK; delete st.startMoney; delete st.enemySpd; delete st.bonus;
    applyMod(st, mods[Math.floor(rnd() * mods.length)], CHAPTERS[base.chapter], base.chapter, base.no - 1);
    const shuffle = (list) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const pick = (list, n) => shuffle(list).slice(0, n);
    const walls = ['brownie', 'gnome']; // the cheap starters: the rifleman and the defender
    const pool = UNITS.filter((u) => u.rank !== 'SS' && !walls.includes(u.id));
    // the condition's counters are always in the squad: anti-air for air raids / flyers, snipers for armour and artillery
    const must = [];
    const need = (ok, n) => { pick(pool.filter((u) => ok(u) && !must.includes(u.id)), n).forEach((u) => must.push(u.id)); };
    const pools = st.spawns.map((x) => x[0]).concat(st.boss ? [st.boss.e] : []);
    if (st.mod === 'air' || pools.some((e) => ENEMIES[e].fly)) need((u) => u.range >= 2.4 && u.type !== 'wall', 2);
    if (st.mod === 'armor' || pools.some((e) => ENEMIES[e].armor)) need((u) => u.type === 'snipe', 1);
    if (pools.some((e) => ENEMIES[e].artillery)) need((u) => u.type === 'snipe' || u.range >= 5, 1); // something that reaches the guns
    const mid = must.concat(pick(pool.filter((u) => !must.includes(u.id)).map((u) => u.id), 6 - must.length));
    const ss = pick(UNITS.filter((u) => u.rank === 'SS').map((u) => u.id), 1);
    return Object.assign(st, {
      daily: true, day, code: 'DAILY', name: '일일 작전 · ' + base.name,
      squad: [...walls, ...mid, ...ss], squadLv: Math.max(1, Math.round(1 + base.ix / 11)) + (st.mod === 'emp' || st.mod === 'poor' ? 1 + Math.floor(base.chapter / 2) : 0), // the two starving conditions: extra levels, more in later chapters (bot: 30 seeds)
      xp: Math.round(base.xp * 1.5),
    });
  }

  // squad synergies: active when the formation holds the right mix (shown on the squad screen, applied in battle)
  // squad synergies: type groups (with a second tier), story pairs, and two that ask for a sacrifice (no SS / a small squad)
  const has = (us, ...ids) => ids.every((id) => us.some((u) => u.id === id));
  const nType = (us, ...ts) => us.filter((u) => ts.includes(u.type)).length;
  const SYNERGIES = [
    { id: 'chill', kind: '유형', name: '냉각 포격', need: '둔화·기절형 + 포격 범위형', tip: '둔화·기절된 적이 받는 피해 +20%',
      test: (us) => us.some((u) => u.type === 'slow' || u.type === 'stun') && us.some((u) => u.type === 'splash') },
    { id: 'bulwark', kind: '유형', name: '철벽 전열', need: '방벽·근접형 3명 이상', tip: '방벽·근접형 체력 +20%', test: (us) => nType(us, 'wall', 'melee') >= 3 },
    { id: 'bulwark2', kind: '유형', name: '철벽 전열 II', need: '방벽·근접형 5명 이상', tip: '방벽·근접형 체력 +20% 추가 · 넉백 저항', test: (us) => nType(us, 'wall', 'melee') >= 5 },
    { id: 'chain', kind: '유형', name: '전격 연쇄', need: '전격형 2명 이상', tip: '전격형 공격 +20%', test: (us) => nType(us, 'chain') >= 2 },
    { id: 'eagle', kind: '유형', name: '매의 눈', need: '저격형 2명 이상', tip: '저격형 사거리 +0.6', test: (us) => nType(us, 'snipe') >= 2 },
    { id: 'volley', kind: '유형', name: '집중 포화', need: '사격형 3명 이상', tip: '사격형 공격 +15%', test: (us) => nType(us, 'single') >= 3 },
    { id: 'volley2', kind: '유형', name: '집중 포화 II', need: '사격형 5명 이상', tip: '사격형 공격 +15% 추가', test: (us) => nType(us, 'single') >= 5 },
    { id: 'ace', kind: '유형', name: '에이스 편대', need: 'S·SS 3명 이상', tip: '스킬 충전 시간 -15%', test: (us) => us.filter((u) => u.rank === 'S' || u.rank === 'SS').length >= 3 },
    { id: 'flame', kind: '인연', name: '불꽃 듀오', need: '임펫 + 피닉스', tip: '두 대원 공격 +25%', pair: ['impet', 'phoenix'], test: (us) => has(us, 'impet', 'phoenix') },
    { id: 'tide', kind: '인연', name: '해류 지원', need: '운디네 + 테티스', tip: '두 대원 재배치 -25% · 둔화 시간 +50%', pair: ['undine', 'thetis'], test: (us) => has(us, 'undine', 'thetis') },
    { id: 'wings', kind: '인연', name: '검은 날개', need: '레이븐 + 흐레스벨그', tip: '두 대원 사거리 +0.5 · 공격 +10%', pair: ['raven', 'hraesvelgr'], test: (us) => has(us, 'raven', 'hraesvelgr') },
    { id: 'shore', kind: '인연', name: '해안 자매', need: '브라우니 + 레프리콘 + 노움', tip: '세 대원 체력 · 공격 +12%', pair: ['brownie', 'leprechaun', 'gnome'], test: (us) => has(us, 'brownie', 'leprechaun', 'gnome') },
    { id: 'command', kind: '인연', name: '지휘 체계', need: '라비아타 + 발키리', tip: '전원 체력 +8%', pair: ['labiata', 'valkyrie'], test: (us) => has(us, 'labiata', 'valkyrie') },
    { id: 'grunt', kind: '각오', name: '보병의 긍지', need: 'SS 없이 편성', tip: '전원 공격 +20% · 체력 +15%', test: (us) => us.length >= 5 && !us.some((u) => u.rank === 'SS') },
    { id: 'lean', kind: '각오', name: '소수 정예', need: '편성 6명 이하', tip: '재배치 시간 -30% · 발전 효율 시작 Lv2', test: (us) => us.length > 0 && us.length <= 6 },
  ];
  const synergiesOf = (units) => SYNERGIES.filter((sy) => sy.test(units)).map((sy) => sy.id);

  // missions: long goals with rewards (claimed on the mission screen). goal(save) -> [progress, target]
  const starSum = (b) => Object.values(b || {}).reduce((a, v) => a + v, 0);
  const st_ = (sv, k) => (sv.stats && sv.stats[k]) || 0;
  const MISSIONS = [
    { id: 'tut1', name: '신병 교육 수료', desc: '첫 작전 1-1 클리어 (튜토리얼)', goal: (sv) => [Math.min(sv.cleared, 1), 1], reward: { tuna: 300, parts: 1000 } },
    ...CHAPTERS.map((ch, c) => ({ id: 'ch' + (c + 1), name: `CHAPTER ${c + 1} 돌파`, desc: ch.title + ' 클리어', goal: (sv) => [Math.min(sv.cleared, (c + 1) * PER_CH) - c * PER_CH, PER_CH], reward: { tuna: 200 + 100 * c, parts: 500 + 250 * c, wild: { A: 10, S: 1 + Math.floor(c / 3) } } })),
    ...[30, 90, 160, 240].map((n, i) => ({ id: 'star' + n, name: `별 ${n}개`, desc: '캠페인 별점 합계', goal: (sv) => [starSum(sv.stars), n], reward: { tuna: 300 + 300 * i, parts: 0, wild: { S: 2 + i } } })),
    ...[500, 2000, 6000].map((n, i) => ({ id: 'kill' + n, name: `철충 ${n.toLocaleString()}기 격파`, desc: '전투에서 쓰러뜨린 철충', goal: (sv) => [st_(sv, 'kills'), n], reward: { tuna: 0, parts: 1000 * (i + 1) } })),
    ...[300, 1500].map((n, i) => ({ id: 'dep' + n, name: `대원 ${n}회 출격`, desc: '전투에서 배치한 횟수', goal: (sv) => [st_(sv, 'deploys'), n], reward: { tuna: 0, parts: 1500 * (i + 1) } })),
    ...[20, 150].map((n, i) => ({ id: 'skill' + n, name: `스킬 발동 ${n}회`, desc: 'S·SS 스킬 사용 (충전되면 자동)', goal: (sv) => [st_(sv, 'skills'), n], reward: { tuna: 200 * (i + 1), parts: 0 } })),
    ...[15, 25, 40].map((n, i) => ({ id: 'own' + n, name: `대원 ${n}명 보유`, desc: '합류한 대원 수', goal: (sv) => [Object.keys(sv.owned || {}).length, n], reward: { tuna: 300 * (i + 1), parts: 0 } })),
    ...[3, 8].map((n, i) => ({ id: 'ss' + n, name: `SS ${n}명 보유`, desc: '합류한 SS 대원 수', goal: (sv) => [Object.keys(sv.owned || {}).filter((id) => UNIT[id] && UNIT[id].rank === 'SS').length, n], reward: { tuna: 500 * (i + 1), parts: 0 } })),
    ...[1, 4, 8].map((n, i) => ({ id: 'hard' + n, name: `하드 ${n}장 돌파`, desc: '하드 모드 챕터 클리어', goal: (sv) => [Math.floor((sv.hardCleared || 0) / PER_CH), n], reward: { tuna: 500 * (i + 1), parts: 1000 * (i + 1) } })),
    ...[5, 10, 15].map((n, i) => ({ id: 'inf' + n, name: `무한 전장 ${n}층`, desc: '무한 전장 최고 기록', goal: (sv) => [sv.infBest || 0, n], reward: { tuna: 400 * (i + 1), parts: 0 } })),
    ...[3, 10].map((n, i) => ({ id: 'daily' + n, name: `일일 작전 ${n}회`, desc: '일일 작전 보상 수령', goal: (sv) => [st_(sv, 'dailies'), n], reward: { tuna: 300 * (i + 1), parts: 1000 * (i + 1) } })),
    ...[50, 200].map((n, i) => ({ id: 'pull' + n, name: `제조 ${n}회`, desc: '대원 제조 횟수', goal: (sv) => [sv.pulls || 0, n], reward: { tuna: 300 * (i + 1), parts: 0 } })),
  ];

  // rewards for a stage result. kind: 'first' (first clear), 'win' (repeat clear), 'lose' (nothing)
  function reward(st, kind) {
    if (kind === 'lose') return { xp: 0, parts: 0, tuna: 0 };
    if (st.daily) return kind === 'first' ? { xp: st.xp, parts: 1000, tuna: 300, wild: { A: 5 } } : { xp: Math.round(st.xp / 3), parts: 200, tuna: 0 };
    if (st.infinite) return { xp: st.xp, parts: 1200 + 120 * st.floor, tuna: kind === 'first' ? 150 + 20 * st.floor : 0, wild: kind === 'first' && st.floor % 5 === 0 ? { S: 1 } : null };
    const g = st.ix, k = st.hard ? 1.6 : 1, boss = st.last ? 5 : 1;
    // first clears also bring wild cards: every stage B, the elite A, the boss S (hard: A / S, its boss SS)
    const wild = kind !== 'first' ? null : st.hard ? (st.last ? { SS: 1, S: 2 } : { A: 4 }) : st.last ? { S: 1, A: 5 } : st.elite ? { A: 5 } : { B: 10 };
    return {
      xp: kind === 'first' ? st.xp : Math.round(st.xp / 2),
      parts: Math.round((150 + 10 * g) * k * (st.bonus || 1) * (kind === 'first' ? 1 : 0.5) / 10) * 10, // replays pay half
      tuna: kind === 'first' ? Math.round((30 + 3 * g) * k * boss / 10) * 10 : 0,
      wild,
    };
  }

  // repeatable missions: counters reset each day (UTC, same day as the daily operation) and each week (from Monday)
  const PERIODIC = {
    day: [
      { id: 'd_win', name: '전투 승리 3회', desc: '어떤 전투든 승리', key: 'wins', n: 3, reward: { tuna: 0, parts: 300, wild: { B: 15 } } },
      { id: 'd_kill', name: '철충 150기 격파', desc: '오늘 쓰러뜨린 철충', key: 'kills', n: 150, reward: { tuna: 0, parts: 200 } },
      { id: 'd_skill', name: '스킬 발동 5회', desc: 'S·SS 스킬 사용 (충전되면 자동)', key: 'skills', n: 5, reward: { tuna: 30, parts: 100 } },
      { id: 'd_star', name: '★3 승리 1회', desc: '6분 안에, 기지 체력 80% 이상으로 승리', key: 'star3', n: 1, reward: { tuna: 50, parts: 0 } },
      { id: 'd_op', name: '일일 작전 완료', desc: '오늘의 일일 작전 승리', key: 'daily', n: 1, reward: { tuna: 70, parts: 150, wild: { A: 4 } } },
    ],
    week: [
      { id: 'w_win', name: '전투 승리 25회', desc: '이번 주 승리', key: 'wins', n: 25, reward: { tuna: 150, parts: 1500, wild: { A: 12, S: 1 } } },
      { id: 'w_kill', name: '철충 1,500기 격파', desc: '이번 주 쓰러뜨린 철충', key: 'kills', n: 1500, reward: { tuna: 0, parts: 1250 } },
      { id: 'w_star', name: '★3 승리 10회', desc: '이번 주 ★3 승리', key: 'star3', n: 10, reward: { tuna: 200, parts: 0, wild: { S: 2 } } },
      { id: 'w_hard', name: '하드 · 무한 전장 승리 5회', desc: '하드 스테이지나 무한 전장 층 돌파', key: 'elite', n: 5, reward: { tuna: 200, parts: 500, wild: { SS: 1 } } },
      { id: 'w_op', name: '일일 작전 5회', desc: '이번 주 일일 작전 승리', key: 'daily', n: 5, reward: { tuna: 300, parts: 750, wild: { S: 1 } } },
    ],
  };
  const dayNo = (now = Date.now()) => Math.floor(now / 86400000);
  const weekNo = (day) => Math.floor((day + 3) / 7); // day 0 (1970-01-01) was a Thursday: weeks turn on Monday
  // resets the counters when the day / week has changed; returns the live record
  function periodic(sv, now) {
    const d = dayNo(now), w = weekNo(d);
    const p = sv.per = sv.per || {};
    if (p.day !== d) Object.assign(p, { day: d, d: {}, cd: {} });
    if (p.week !== w) Object.assign(p, { week: w, w: {}, cw: {} });
    return p;
  }

  window.DATA = { UNITS, UNIT, TYPES, ROLES, RANKS, RANK_ORDER, STARTERS, STAGE_REWARD, CHAPTER_REWARD, CHAPTERS, PER_CH, GACHA, SHOP_PRICE, SHOP_NEW_SS, DECK_COST, DECK_CAP, START_LV, CARDS, cardsNeed, relLv, PULL_CARDS, WILD_SHOP, SHOP_CARDS,
    ENEMIES, TRAITS, MODS, INF_BUFFS, dailyStage, SYNERGIES, synergiesOf, MISSIONS, PERIODIC, periodic, dayNo, BASE_RIG, STAGES, HARD, infiniteFloor, WORKER, CANNON, MAX_LV, lvMul, lvCost, xpNeed, reward };
})();
