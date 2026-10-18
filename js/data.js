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
    ['brownie', '브라우니', 'B', 'single', 'bullet', 0xffe08a, 'rifle', '싸고 빠르게 뽑는 돌격소총병', { cost: 50 / 60, spd: 1.07 }],
    ['leprechaun', '레프리콘', 'B', 'wall', 'bullet', 0x9dff7a, 'mg', '높은 체력으로 진격을 막는 기관총 벽'],
    ['gnome', '노움', 'B', 'splash', 'grenade', 0xffa040, 'cannon', '유탄으로 무리 지은 적을 한 번에'],
    ['impet', '임펫', 'B', 'melee', 'flame', 0xff6a2a, 'spray', '화염방사로 근거리 적을 모두 태움'],
    ['daphne', '다프네', 'B', 'slow', 'wave', 0x9dffc8, 'laser', '음파로 적을 25% 느리게', { slow: [0.25, 1.6], cost: 0.8 }],
    ['banshee', '밴시', 'A', 'slow', 'wave', 0x7affd4, 'laser', '넓은 음파로 적을 40% 느리게'],
    ['sylphid', '실피드', 'A', 'stun', 'bullet', 0xd78bff, 'gun', '고속 비행 사격, 맞은 적이 잠시 멈춤', { spd: 1.6, range: -0.4 }],
    ['raven', '레이븐', 'A', 'snipe', 'snipe', 0xfff2b0, 'handgun', '멀리서 한 발씩 정확하게'],
    ['nymph', '님프', 'A', 'slow', 'frost', 0x6fe3ff, 'laser', '냉기로 적을 45% 느리게', { slow: [0.45, 2.0] }],
    ['amy', '에이미 레이저', 'A', 'snipe', 'snipe', 0xd9ff8a, 'handgun', '연속 저격 탄막', { rate: 0.8, atk: 0.8 }],
    ['andvari', '안드바리', 'A', 'splash', 'grenade', 0xffc070, 'cannon', '박격포로 넓게 포격', { range: 0.4 }],
    ['phoenix', '피닉스', 'S', 'splash', 'fireball', 0xff5a1f, 'expS', '화염탄 범위 폭격'],
    ['thetis', '테티스', 'S', 'chain', 'lightning', 0x66ccff, 'elec', '전격으로 무리를 꿰뚫음'],
    ['hraesvelgr', '흐레스벨그', 'S', 'laser', 'laser', 0x9ab8ff, 'laserBig', '대구경 레이저 포격'],
    ['undine', '운디네', 'S', 'slow', 'frost', 0x9feaff, 'ice', '멀리서 얼려 50% 느리게', { slow: [0.5, 2.6], range: 0.6 }],
    ['valkyrie', '발키리', 'S', 'single', 'bullet', 0x9fd0ff, 'rifle', '빠른 발로 전선에 먼저 닿는 연사형', { spd: 1.7, rate: 0.65, hp: 1.2, cost: 2.4, cd: 2 }],
    // SS: gacha only
    ['zero', '쿠노이치 제로', 'SS', 'melee', 'slash', 0xff3b6b, 'slash', '질풍 같은 연속 베기', { spd: 1.6, rate: 0.8, skill: 4 }],
    ['hela', '헬라', 'SS', 'chain', 'lightning', 0xc77dff, 'elec', '저승의 번개가 무리를 휩씀', { skill: 3 }],
    ['azazel', '아자젤', 'SS', 'splash', 'holy', 0xffe9a0, 'energy', '성스러운 빛의 폭발', { skill: 3, atk: 1.1 }],
    ['saraqael', '사라카엘', 'SS', 'stun', 'wave', 0xb28cff, 'energy', '파동으로 적 전열을 멈춤', { skill: 3 }],
    ['leona', '철혈의 레오나', 'SS', 'laser', 'laser', 0xff9ad5, 'laserBig', '단단한 몸과 관통 레이저', { hp: 1.6, skill: 4 }],
    ['ullr', '우르', 'SS', 'laser', 'laser', 0x7fe8ff, 'laserBig', '초장거리 정밀 레이저', { range: 1.2, hp: 0.8, skill: 3 }],
    ['harpy', '하르페이아', 'SS', 'splash', 'missile', 0xff8a3d, 'missile', '미사일 융단 폭격', { range: 1.0, skill: 3 }],
    ['eternity', '이터니티', 'SS', 'single', 'bullet', 0xffd98a, 'mg', '쉬지 않는 기관포 사격', { rate: 0.4, atk: 0.7, hp: 1.4, range: 1.0, cost: 3, cd: 2.5 }],
    ['lemonadealpha', '레모네이드 알파', 'SS', 'chain', 'lightning', 0xffe14d, 'elec', '전장을 가르는 전격', { range: 0.8, skill: 3 }],
    ['sleipnir', '슬레이프니르', 'SS', 'stun', 'missile', 0xffb070, 'missile', '미사일로 묶고 터뜨림', { range: 0.8, skill: 3 }],
    ['blacklilith', '블랙 리리스', 'SS', 'melee', 'slash', 0xd0405a, 'slash', '거대한 낫의 학살', { atk: 1.2, skill: 3 }],
    ['cyclopsprincess', '사이클롭스 프린세스', 'SS', 'melee', 'slash', 0xff3a5a, 'slash', '안대를 풀면 모든 것을 파괴', { hp: 1.3, skill: 3 }],
    ['blindprincess', '블라인드 프린세스', 'SS', 'snipe', 'holy', 0xfff1b8, 'energy', '빛의 일격으로 처단', { range: 0.8, skill: 3 }],
    ['brunhild', '브륀힐드', 'SS', 'splash', 'fireball', 0xff5530, 'expM', '화염의 대검이 전장을 태움', { hp: 1.4, atk: 1.15, skill: 3 }],
    ['tiamat', '티아멧', 'SS', 'laser', 'laser', 0x6ef0ff, 'laserBig', '전장 끝까지 닿는 대구경 레이저', { range: 1.6, atk: 1.2, skill: 3 }],
    ['khan', '신속의 칸', 'SS', 'snipe', 'snipe', 0xffcf7a, 'rifle', '번개 같은 속사 저격', { rate: 0.6, atk: 0.75, spd: 1.8, skill: 3 }],
    ['labiata', '라비아타 프로토타입', 'SS', 'melee', 'slash', 0xffd36e, 'swing', '바이오로이드의 원점. 「백화요란」', { hp: 1.5, atk: 1.3, skill: 3 }],
    ['lrl', 'LRL', 'SS', 'splash', 'holy', 0xb46bff, 'energy', '칠흑의 마법 포격', { range: 1.2, skill: 3 }],
    ['constantia', '콘스탄챠 S2', 'SS', 'laser', 'laser', 0xff6af0, 'laserBig', '거대 함포 레이저', { range: 1.2, hp: 1.2, skill: 3 }],
    ['titania', '티타니아 프로스트', 'SS', 'slow', 'frost', 0xaef4ff, 'ice', '광역 빙결로 전장을 얼림', { slow: [0.65, 2.6], range: 1.0, skill: 3 }],
    ['mercury', '프랭스터 머큐리', 'SS', 'melee', 'slash', 0x7dffb0, 'slash', '초고속 연타', { rate: 0.6, spd: 1.8, skill: 4 }],
    ['empress', '엠프리스', 'SS', 'splash', 'missile', 0x9fe6ff, 'expM', '빙결 미사일 폭격', { range: 1.4, slow: [0.3, 1.5], skill: 3 }],
    ['fafnir', '파프니르', 'SS', 'chain', 'lightning', 0x5aa8ff, 'elec', '용의 뇌격', { hp: 1.5, range: 1.0, skill: 3 }],
    ['ramiel', '라미엘', 'SS', 'stun', 'holy', 0xfff1b8, 'energy', '천벌의 빛으로 묶음', { range: 1.0, atk: 1.2, skill: 3 }],
  ];
  // the starting squad, and the unit each stage hands out on its first clear (stage index -> id)
  const STARTERS = ['brownie', 'leprechaun', 'gnome'];
  const STAGE_REWARD = ['impet', 'nymph', 'valkyrie', 'raven', 'undine', 'phoenix', 'thetis', 'hraesvelgr'];

  const r10 = (v) => Math.max(10, Math.round(v / 10) * 10);
  const UNITS = LIST.map(([id, name, rank, type, fx, color, sfx, desc, tw = {}]) => {
    const t = TYPES[type], R = RANKS[rank];
    const u = {
      id, name, rank, type, role: t.role, fx, color, sfx, desc,
      cost: r10(t.cost * R.c * (tw.cost || 1)),
      cd: Math.min(45, Math.round(t.cd * R.cd * (tw.cd || 1) * 10) / 10),
      hp: Math.round(t.hp * R.k * (tw.hp || 1)),
      atk: Math.round(t.atk * R.k * (tw.atk || 1)),
      rate: Math.round(t.rate * (tw.rate || 1) * 100) / 100,
      range: Math.round((t.range + R.r + (tw.range || 0)) * 10) / 10,
      spd: Math.round(t.spd * (tw.spd || 1) * 100) / 100,
      kb: t.kb, area: t.area || 0,
      slow: tw.slow || t.slow || null,
      skill: tw.skill || 0, // S / SS: ordered by the player (game.js SKILL); others none
      gacha: rank === 'SS' ? 1 : 0,
      legend: rank === 'SS' ? 1 : 0,
    };
    const st = STAGE_REWARD.indexOf(id);
    u.unlock = STARTERS.includes(id) ? 0 : st >= 0 ? st + 1 : -1; // -1: gacha only
    return u;
  });
  const UNIT = Object.fromEntries(UNITS.map((u) => [u.id, u]));

  // currencies: parts (부품, earned by every win) pay for the making (gacha); tuna (참치, first clears / records)
  // buys a chosen unit outright in the recruit shop.
  // gacha: rates per rank, a 10-pull guarantees S or better, and PITY pulls without SS guarantee one.
  // The featured SS (changes daily) takes half of the SS draws. Duplicates turn into XP.
  const GACHA = {
    cost1: 500, cost10: 5000, rates: { B: 0.47, A: 0.32, S: 0.18, SS: 0.03 }, pity: 80, featuredShare: 0.5, // tools/econ_sim.js: ~12 SS in 4 weeks
    dupeXp: { B: 100, A: 300, S: 800, SS: 3000 }, startParts: 5000, startTuna: 300,
  };
  const SHOP_PRICE = { B: 150, A: 400, S: 1000, SS: 3000 }; // tuna, recruit shop (a link for an owned unit)
  const SHOP_NEW_SS = 10000; // a new SS recruited outright costs double: the making stays the main way to meet SS

  // core link (as in the original): every duplicate of an owned unit links one more core, up to LINK_MAX.
  // Each link: +8% hp / atk; a full link adds +10% more and 15% shorter redeploy. Duplicates past full link become XP.
  const LINK_MAX = 5;
  const linkMul = (n) => 1 + 0.08 * n + (n >= LINK_MAX ? 0.1 : 0);
  const linkCd = (n) => (n >= LINK_MAX ? 0.85 : 1);

  // formation cost: the squad's ranks must add up to DECK_CAP or less (an all-SS squad does not fit)
  const DECK_COST = { B: 1, A: 2, S: 4, SS: 8 };
  const DECK_CAP = 30;

  // money: reward when it falls
  const ENEMIES = {
    NightChick_N: { name: '나이트 칙', hp: 110, atk: 9, rate: 1.2, range: 1.5, spd: 1.5, kb: 2, h: 1.0, money: 18, color: 0xff8855 },
    Legion_N: { name: '레기온', hp: 280, atk: 20, rate: 1.4, range: 2.0, spd: 1.0, kb: 2, h: 1.45, money: 40, color: 0xff5555 },
    Drone_N: { name: '드론', hp: 150, atk: 14, rate: 1.0, range: 3.0, spd: 2.0, kb: 1, h: 1.1, fly: 1, dive: 1, traits: ['fly', 'dive'], money: 30, color: 0xffaa33 },
    Fallen_N: { name: '폴른', hp: 520, atk: 34, rate: 1.3, range: 2.0, spd: 1.3, kb: 2, h: 1.5, money: 70, color: 0xff4466 },
    Centurion_N: { name: '센츄리온', shield: 0.35, traits: ['shield'], hp: 820, atk: 52, rate: 1.6, range: 2.3, spd: 0.9, kb: 2, h: 1.6, money: 110, color: 0xff6644 },
    Intruder_N: { name: '인트루더', fly: 1, traits: ['fly'], hp: 520, atk: 70, rate: 2.0, range: 3.8, spd: 1.1, kb: 2, area: 1, h: 1.5, money: 120, color: 0xffcc44 },
    Phalangites_N: { name: '팔랑기테스', artillery: 1, traits: ['artillery'], hp: 1100, atk: 64, rate: 2.2, range: 4.2, spd: 0.9, kb: 2, area: 1, h: 1.6, money: 160, color: 0xff7744 },
    Rampart_N: { name: '램파트', armor: 1, traits: ['armor'], hp: 3600, atk: 40, rate: 1.8, range: 1.9, spd: 0.6, kb: 1, h: 1.8, money: 220, color: 0xff9966 },
    Juggernaut_N: { name: '저거너트', armor: 1, traits: ['armor'], hp: 3000, atk: 170, rate: 2.4, range: 2.6, spd: 0.8, kb: 2, area: 1, h: 2.0, money: 280, color: 0xff3322 },
    BigChick_N: { name: '빅 칙', hp: 2400, atk: 90, rate: 2.0, range: 2.2, spd: 0.9, kb: 2, area: 1, h: 2.1, money: 260, color: 0xff8844 },
    Gigantes_N: { name: '기간테스', armor: 1, traits: ['armor'], hp: 6500, atk: 260, rate: 2.8, range: 2.8, spd: 0.7, kb: 2, area: 1, h: 2.5, money: 450, color: 0xff3333 },
    Destroyer_N: { name: '디스트로이어', artillery: 1, traits: ['artillery', 'armor'], armor: 1, hp: 2600, atk: 240, rate: 3.0, range: 4.8, spd: 0.7, kb: 3, area: 1, h: 2.0, money: 500, color: 0xff2266 },
    // bosses
    EmperorChick_N: { name: '엠페러 칙', hp: 16000, atk: 220, rate: 2.4, range: 3.0, spd: 0.6, kb: 3, area: 1, h: 3.0, money: 1500, boss: 1, color: 0xffaa22 },
    Executioner_EW: { name: '엑스큐셔너', armor: 1, traits: ['armor'], hp: 34000, atk: 480, rate: 2.6, range: 3.6, spd: 0.6, kb: 3, area: 1, h: 3.2, money: 2500, boss: 1, color: 0xff2244 },
    IronPrince_N: { name: '철의 왕자', shield: 0.2, traits: ['shield'], hp: 72000, atk: 900, rate: 2.8, range: 4.2, spd: 0.55, kb: 3, area: 1, h: 3.5, money: 4000, boss: 1, color: 0xff1155 },
  };
  // enemy traits (shown on the stage sheet): what they ask of the squad
  const TRAITS = {
    fly: { name: '비행', tip: '방벽·근접(사거리 2.4 미만)은 공격 불가 · 대공 대원 필요' },
    dive: { name: '돌파', tip: '공격할 수 없는 대원은 넘어서 기지로 날아감' },
    armor: { name: '장갑', tip: '범위 공격 피해 50% · 저격은 150%' },
    shield: { name: '보호막', tip: '체력 일부만큼 보호막을 먼저 깎아야 함' },
    artillery: { name: '포격', tip: '사거리 2배 거리에서 기지를 포격(피해 50%) · 빨리 처치해야 함' },
  };
  const BASE_RIG = 'Fortress_N'; // the enemy base: the Fortress rig, standing still

  // ── campaign: 8 chapters x 10 stages; the 5th stage brings an elite (mid-boss), the 10th the chapter boss ──
  // pool: the chapter's worms, weakest first (the first two come endlessly, the rest in limited numbers)
  // boss: [enemy, strength]; reward: the unit that joins on the chapter's first clear; story: js/story.js
  const CHAPTERS = [
    { title: '상륙 작전', sub: '오르카 해안', bg: 'bg_field', pool: ['NightChick_N', 'Legion_N', 'Drone_N'], boss: ['BigChick_N', 0.8],
      stages: ['해안 교두보', '모래톱 방어선', '등대 언덕', '갯바위 돌파', '첫 번째 그림자', '젖은 숲길', '버려진 어촌', '방파제 사수', '해안 포대 탈환', '거대 개체 「빅 칙」'] },
    { title: '잿빛 정찰', sub: '폐허 도시', bg: 'bg_city', pool: ['NightChick_N', 'Drone_N', 'Legion_N', 'Fallen_N'], boss: ['EmperorChick_N', 0.7],
      stages: ['무너진 대로', '통신탑 탈환', '지하 차도', '빈 시장 거리', '상공의 감시자', '고가 철로', '붉은 신호', '폐병원', '도시 중심부', '군주 「엠페러 칙」'] },
    { title: '전초기지 강습', sub: '철충 전진 거점', bg: 'bg_base', pool: ['Legion_N', 'Fallen_N', 'Drone_N', 'Centurion_N'], boss: ['Gigantes_N', 1.0],
      stages: ['외곽 감시선', '격납고 진입', '보급 라인 절단', '경비 순찰로', '철문 앞의 백부장', '탄약고 폭파', '제어실 확보', '냉각 구역', '중앙 승강기', '수문장 「기간테스」'] },
    { title: '처형인의 사냥터', sub: '구조 작전', bg: 'bg_base', pool: ['Fallen_N', 'Centurion_N', 'Intruder_N', 'Legion_N'], boss: ['Executioner_EW', 0.6],
      stages: ['구조 신호', '감옥 구역', '추적자들', '어둠 속의 침입자', '사냥꾼의 그물', '지하 수로', '탈출로 확보', '배신의 통로', '최후의 문', '처형인 「엑스큐셔너」'] },
    { title: '포화의 시가지', sub: '회색 시가지', bg: 'bg_city', pool: ['Centurion_N', 'Intruder_N', 'Phalangites_N', 'Rampart_N'], boss: ['Gigantes_N', 1.4],
      stages: ['포격 지대', '방벽 너머', '저격수의 거리', '광장 공방전', '움직이는 성벽', '폐허 아케이드', '교차로 봉쇄', '철벽 돌파', '포대 침묵', '강철 행렬'] },
    { title: '불길 속의 날개', sub: '불타는 평원', bg: 'bg_field', pool: ['Fallen_N', 'Intruder_N', 'Juggernaut_N', 'BigChick_N', 'Phalangites_N'], boss: ['EmperorChick_N', 1.3],
      stages: ['불붙은 들판', '연기 속의 행군', '재의 언덕', '타오르는 숲', '저거너트 진군로', '붉은 강', '검게 탄 마을', '불새의 비행', '열기의 장벽', '불사의 군주'] },
    { title: '거인의 길', sub: '중장갑 회랑', bg: 'bg_field', pool: ['Centurion_N', 'Phalangites_N', 'Rampart_N', 'Gigantes_N', 'Destroyer_N'], boss: ['Executioner_EW', 0.8],
      stages: ['거인의 발자국', '무너진 고가도로', '포대 협곡', '강철 숲', '거인의 그림자', '파괴자의 사선', '철골 다리', '회랑 입구', '거인의 묘지', '처형인의 귀환'] },
    { title: '철의 왕좌', sub: '철충 본거지', bg: 'bg_base', pool: ['Centurion_N', 'Fallen_N', 'Juggernaut_N', 'Destroyer_N', 'Gigantes_N'], boss: ['IronPrince_N', 1.0],
      stages: ['왕좌의 관문', '철의 회랑', '심층 격납고', '붉은 코어', '왕의 근위대', '파멸의 포격', '마지막 보급선', '심장부', '최후의 방벽', '「철의 왕자」'] },
  ];
  // stage conditions, hand-placed per chapter (CHAPTER_MODS): each changes how a stage has to be played
  const MODS = {
    swarm: { name: '대군', tip: '약한 철충이 쉴 새 없이 몰려옴 · 범위 공격이 유리' },
    air: { name: '공습', tip: '비행 개체 다수 · 사거리 2.4 이상 대원 필요' },
    armor: { name: '중장갑', tip: '장갑 개체 출현 · 저격 · 단일 화력이 유리' },
    blitz: { name: '기습', tip: '시작과 동시에 돌격 · 적 이동 속도 +25%' },
    siege: { name: '포위전', tip: '요새 체력 1.5배 · 적 출현은 느림 · 보상 1.3배' },
    emp: { name: 'EMP', tip: '오르카 포격 충전 속도 40%' },
    poor: { name: '보급 차단', tip: '자금 수입 -25%' },
    rich: { name: '보급 지원', tip: '시작 자금 500 · 적 강도 +10%' },
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
    Rampart_N: 26, Juggernaut_N: 26, BigChick_N: 24, Gigantes_N: 40, Destroyer_N: 45 };
  const PER_CH = 10;
  const MID = 4; // index of the elite stage in a chapter

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
  const MAX_LV = 20;
  const lvMul = (lv) => 1 + 0.2 * (lv - 1); // hp / atk at unit level lv
  const lvCost = (lv) => Math.round(150 * Math.pow(lv, 1.9) / 50) * 50; // xp from lv to lv + 1

  // ── after the campaign ──
  // hard: every campaign stage again, much stronger worms (opens per chapter once its normal 10 stages are cleared)
  STAGES[STAGES.length - 1].finale = true; // the war's last battle ends with its own sequence (game.js finale)
  const HARD = STAGES.map((st) => Object.assign({}, st, {
    hard: true, finale: false, ix: st.ix, code: 'H' + st.code, pow: Math.round((st.pow * 1.8 + 1.0) * 100) / 100,
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
    { id: 'money', name: '보급 선적', tip: '시작 자금 +300' },
    { id: 'income', name: '생산 라인', tip: '자금 수입 +15%' },
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
    const walls = ['brownie', 'leprechaun'];
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
    { id: 'lean', kind: '각오', name: '소수 정예', need: '편성 6명 이하', tip: '재배치 시간 -30% · 작업 효율 시작 Lv2', test: (us) => us.length > 0 && us.length <= 6 },
  ];
  const synergiesOf = (units) => SYNERGIES.filter((sy) => sy.test(units)).map((sy) => sy.id);

  // missions: long goals with rewards (claimed on the mission screen). goal(save) -> [progress, target]
  const starSum = (b) => Object.values(b || {}).reduce((a, v) => a + v, 0);
  const st_ = (sv, k) => (sv.stats && sv.stats[k]) || 0;
  const MISSIONS = [
    ...CHAPTERS.map((ch, c) => ({ id: 'ch' + (c + 1), name: `CHAPTER ${c + 1} 돌파`, desc: ch.title + ' 클리어', goal: (sv) => [Math.min(sv.cleared, (c + 1) * PER_CH) - c * PER_CH, PER_CH], reward: { tuna: 200 + 100 * c, parts: 500 + 250 * c } })),
    ...[30, 90, 160, 240].map((n, i) => ({ id: 'star' + n, name: `별 ${n}개`, desc: '캠페인 별점 합계', goal: (sv) => [starSum(sv.stars), n], reward: { tuna: 300 + 300 * i, parts: 0 } })),
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

  // rewards for a stage result. kind: 'first' (first clear), 'win' (repeat clear), 'lose'
  function reward(st, kind) {
    if (kind === 'lose') return { xp: Math.round(st.xp * 0.1), parts: 60, tuna: 0 };
    if (st.daily) return kind === 'first' ? { xp: st.xp, parts: 1000, tuna: 300 } : { xp: Math.round(st.xp / 3), parts: 200, tuna: 0 };
    if (st.infinite) return { xp: st.xp, parts: 1200 + 120 * st.floor, tuna: kind === 'first' ? 150 + 20 * st.floor : 0 };
    const g = st.ix, k = st.hard ? 1.6 : 1, boss = st.last ? 5 : 1;
    return {
      xp: kind === 'first' ? st.xp : Math.round(st.xp / 2),
      parts: Math.round((150 + 10 * g) * k * (st.bonus || 1) * (kind === 'first' ? 1 : 0.5) / 10) * 10, // replays pay half
      tuna: kind === 'first' ? Math.round((30 + 3 * g) * k * boss / 10) * 10 : 0,
    };
  }

  // repeatable missions: counters reset each day (UTC, same day as the daily operation) and each week (from Monday)
  const PERIODIC = {
    day: [
      { id: 'd_win', name: '전투 승리 3회', desc: '어떤 전투든 승리', key: 'wins', n: 3, reward: { tuna: 0, parts: 300 } },
      { id: 'd_kill', name: '철충 150기 격파', desc: '오늘 쓰러뜨린 철충', key: 'kills', n: 150, reward: { tuna: 0, parts: 200 } },
      { id: 'd_skill', name: '스킬 발동 5회', desc: 'S·SS 스킬 사용 (충전되면 자동)', key: 'skills', n: 5, reward: { tuna: 30, parts: 100 } },
      { id: 'd_star', name: '★3 승리 1회', desc: '6분 안에, 기지 체력 80% 이상으로 승리', key: 'star3', n: 1, reward: { tuna: 50, parts: 0 } },
      { id: 'd_op', name: '일일 작전 완료', desc: '오늘의 일일 작전 승리', key: 'daily', n: 1, reward: { tuna: 70, parts: 150 } },
    ],
    week: [
      { id: 'w_win', name: '전투 승리 25회', desc: '이번 주 승리', key: 'wins', n: 25, reward: { tuna: 150, parts: 1500 } },
      { id: 'w_kill', name: '철충 1,500기 격파', desc: '이번 주 쓰러뜨린 철충', key: 'kills', n: 1500, reward: { tuna: 0, parts: 1250 } },
      { id: 'w_star', name: '★3 승리 10회', desc: '이번 주 ★3 승리', key: 'star3', n: 10, reward: { tuna: 200, parts: 0 } },
      { id: 'w_hard', name: '하드 · 무한 전장 승리 5회', desc: '하드 스테이지나 무한 전장 층 돌파', key: 'elite', n: 5, reward: { tuna: 200, parts: 500 } },
      { id: 'w_op', name: '일일 작전 5회', desc: '이번 주 일일 작전 승리', key: 'daily', n: 5, reward: { tuna: 300, parts: 750 } },
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

  window.DATA = { UNITS, UNIT, TYPES, RANKS, RANK_ORDER, STARTERS, STAGE_REWARD, CHAPTER_REWARD, CHAPTERS, PER_CH, GACHA, SHOP_PRICE, SHOP_NEW_SS, DECK_COST, DECK_CAP, LINK_MAX, linkMul, linkCd,
    ENEMIES, TRAITS, MODS, INF_BUFFS, dailyStage, SYNERGIES, synergiesOf, MISSIONS, PERIODIC, periodic, dayNo, BASE_RIG, STAGES, HARD, infiniteFloor, WORKER, CANNON, MAX_LV, lvMul, lvCost, reward };
})();
