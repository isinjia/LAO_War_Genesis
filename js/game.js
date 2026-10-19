// Side-scrolling lane battle (Battle Cats style): our base on the left sends units right, the enemy base on the right
// sends Iron Worms left. Units walk until something is in reach, then play their original attack clip; damage lands on
// the clip's own fire events (js/anim_events.js). Characters are the SD rigs of js/sd.js (built by tools/build_sd.py).
(function () {
  const D = window.DATA;
  const STEP = 1 / 60;
  const ATK_SPEED_MAX = 2.8;
  // ordered skills: seconds of charge and damage multiplier (over the whole reach) by rank
  const SKILL = { SS: { charge: 12, mult: 4 }, S: { charge: 18, mult: 3 } }; // long attack clips play faster, up to this
  const BASE_W = 1.1; // half width of a base: units stop at its front
  const MAX_ENEMIES = 16; // regular spawns wait while this many are on the field
  const ALLY_K = 0.21; // world units per rig unit for every ally (brownie ~1.7 tall)
  // parts of an original rig left out: Hela's summoned mechs, Andvari's cargo box (as in the defence game)
  const RIG_HIDE = { hela: /^(Meca_\d+|Summons)$/, andvari: /^(Bone_Cargo_Box|Bone_InBox|bone_shadow_box)$/ };
  // rig parts never seen in the original: full-screen dimmers (Thetis' BG_Black_Quad_FX) and sprite masks, which only
  // clip other parts (Cyclops Princess's parts_Sword_Mask drew as a white board)
  const SCREEN_FX = /black_?quad|(^|_)mask$/i;
  const UNIT_SCALE = 1.2; // drawn size over the data heights (reach / hit points use the data heights)

  let renderer, scene, camera, overlay, octx, dpr = 1;
  let VW = 16, VH = 9, camX = 0, camBottom = -2.6, hudFrac = -1, hudTop = 0, zoom = 1; // zoom: wheel / pinch (zMin() = the whole lane, 2 = closer) // hudTop: the top bar's bottom edge (px) // hudFrac: the share of the screen the bottom HUD covers
  let G = null; // the running battle
  let resetFieldInput = () => {};
  let last = 0;
  const tex = {};

  // ── setup ─────────────────────────────────────────────
  function init() {
    const canvas = document.getElementById('gl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x0b0f17);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-8, 8, 6, -3, -10, 10);
    overlay = document.getElementById('overlay');
    octx = overlay.getContext('2d');

    SD.gpuSkin = renderer.capabilities.floatVertexTextures;
    SD.outline = SD.gpuSkin; // dark rim around every fighter (one extra instanced draw each)
    SD.renderer = renderer;
    SD.crossfade = 0.14;
    SD.pinRoot = true;
    SD.pinSkip = { labiata: ['skill'] }; // her skill is a leap off the top of the screen and a slam: keep its flight
    SD.mipmaps = renderer.capabilities.isWebGL2;
    const mobile = Math.min(screen.width, screen.height) < 600;
    SD.texScale = mobile ? 0.35 : 0.5;
    LOD_AT = mobile ? 24 : 60;
    FXB.texScale = mobile ? 0.5 : 1;
    FXB.renderer = renderer;
    ORIG_MAX = mobile ? 40 : 110;

    tex.glow = canvasTex(64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    });
    tex.ring = canvasTex(128, (g, s) => {
      g.strokeStyle = '#fff'; g.lineWidth = s * 0.06; g.shadowColor = '#fff'; g.shadowBlur = s * 0.08;
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); g.stroke();
    });
    tex.shadow = canvasTex(64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    });
    tex.beam = canvasTex(64, (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    });
    // the Orca cannon's beam body: horizontal energy streaks that tile along x (scrolled while it fires)
    tex.energy = canvasTex([256, 64], (g, w, h) => {
      h = h || 64; w = w || 256;
      const v = g.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(0.5, 'rgba(255,255,255,0.55)'); v.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const y = h / 2 + (Math.random() - 0.5) * h * 0.8 * Math.random(), len = 20 + Math.random() * 90, x = Math.random() * w;
        const a = 0.25 + Math.random() * 0.75, th = 0.6 + Math.random() * 2.2;
        for (const dx of [0, -w]) { // drawn twice so it wraps seamlessly
          const gr = g.createLinearGradient(x + dx, 0, x + dx + len, 0);
          gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.fillRect(x + dx, y - th / 2, len, th);
        }
      }
    });
    tex.energy.wrapS = THREE.RepeatWrapping;
    tex.base = canvasTex([256, 384], drawOrcaBase);
    // original effect sprite sheets (tools/build_assets.py FXTEX): IMG.fx_<key>, frame grid in IMG._fxmeta
    tex.fx = {};
    const loader = new THREE.TextureLoader();
    for (const k in (IMG._fxmeta || {})) {
      const t = loader.load(IMG['fx_' + k]);
      t.minFilter = THREE.LinearFilter;
      tex.fx[k] = { t, cols: IMG._fxmeta[k][0], rows: IMG._fxmeta[k][1] };
    }

    addEventListener('resize', resize);
    resize();
    bindInput();
    requestAnimationFrame(frame);
  }

  function canvasTex(size, draw) {
    const [w, h] = Array.isArray(size) ? size : [size, size];
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  // our base: the Orca resistance's forward command tower (drawn here, the asset project has no building rig)
  function drawOrcaBase(g, w, h) {
    const metal = g.createLinearGradient(0, 0, w, 0);
    metal.addColorStop(0, '#2a3a52'); metal.addColorStop(0.45, '#6d8bb0'); metal.addColorStop(0.55, '#8fb0d6'); metal.addColorStop(1, '#22324a');
    // foot
    g.fillStyle = '#1a2536'; g.fillRect(w * 0.06, h * 0.86, w * 0.88, h * 0.14);
    g.fillStyle = '#33dfff'; g.fillRect(w * 0.06, h * 0.86, w * 0.88, 4);
    // tower body
    g.fillStyle = metal;
    g.beginPath(); g.moveTo(w * 0.18, h * 0.87); g.lineTo(w * 0.3, h * 0.24); g.lineTo(w * 0.7, h * 0.24); g.lineTo(w * 0.82, h * 0.87); g.closePath(); g.fill();
    g.strokeStyle = '#0d1624'; g.lineWidth = 4; g.stroke();
    // panels and lights
    for (let i = 0; i < 5; i++) {
      const y = h * (0.34 + i * 0.1);
      g.fillStyle = 'rgba(10,20,34,0.55)'; g.fillRect(w * 0.32 - i * 4, y, w * 0.36 + i * 8, 6);
      g.fillStyle = i % 2 ? '#33dfff' : '#ffd35a';
      g.fillRect(w * 0.27 - i * 4, y + 12, 10, 10); g.fillRect(w * 0.69 + i * 4, y + 12, 10, 10);
    }
    // bridge
    g.fillStyle = '#1b2a40'; g.fillRect(w * 0.22, h * 0.16, w * 0.56, h * 0.1);
    g.fillStyle = '#5ff0ff'; g.fillRect(w * 0.27, h * 0.19, w * 0.46, h * 0.035);
    // antenna
    g.strokeStyle = '#9fc4e8'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w * 0.5, h * 0.16); g.lineTo(w * 0.5, h * 0.02); g.stroke();
    g.fillStyle = '#ff4b5c'; g.beginPath(); g.arc(w * 0.5, h * 0.025, 7, 0, Math.PI * 2); g.fill();
    // emblem: orca fin
    g.fillStyle = '#e9f6ff';
    g.beginPath(); g.moveTo(w * 0.42, h * 0.62); g.quadraticCurveTo(w * 0.5, h * 0.44, w * 0.6, h * 0.5); g.quadraticCurveTo(w * 0.53, h * 0.56, w * 0.58, h * 0.62); g.closePath(); g.fill();
    g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e9f6ff';
    g.fillText('ORCA', w * 0.5, h * 0.74);
  }

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    SD.setOutline(1.4, w, h);
    overlay.width = w * dpr; overlay.height = h * dpr;
    view();
  }
  // the view size for the screen and the zoom: the lane keeps its height on screen, only the scale changes
  const ZMAX = 2;
  // the widest zoom shows the whole lane, both bases (landscape); portrait stops at 0.45 so units stay visible
  function zMin() {
    if (!G) return 0.8;
    const aspect = innerWidth / innerHeight, vw1 = Math.max(8.5, Math.min(10.5, 11 / aspect)) * aspect;
    return Math.min(0.8, Math.max(0.45, vw1 / (G.len + 5.4)));
  }
  function view() {
    const w = innerWidth, h = innerHeight, aspect = w / h;
    VH = Math.max(8.5, Math.min(10.5, 11 / aspect)) / zoom; // portrait phones: a bit more height, units stay readable
    VW = VH * aspect;
    if (window.SDPS) SDPS.viewH = VH; // particles' Max Particle Size is a fraction of the view height
    // the lane sits just above the deploy bar (its measured height when known)
    camBottom = -VH * (hudFrac >= 0 ? Math.max(0.24, Math.min(0.44, hudFrac + 0.06)) : aspect < 1 ? 0.38 : 0.37);
    clampCam();
    updateCam();
    fitBg();
  }

  // zoom about a screen x (the cursor / the pinch centre): the world point under it stays put
  function setZoom(z, sx = innerWidth / 2) {
    z = Math.max(zMin(), Math.min(ZMAX, z));
    if (Math.abs(z - zoom) < 1e-4) return;
    const f = sx / innerWidth - 0.5, wx = camX + f * VW;
    zoom = z; view();
    camX = wx - f * VW;
    clampCam(); updateCam();
    if (G) G.userCam = performance.now();
  }

  function clampCam() {
    if (!G) return;
    const lo = -3.0 + VW / 2, hi = G.len + 2.4 - VW / 2; // the AGS base stays whole at the left end
    camX = lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, camX));
  }
  function updateCam() {
    const sx = G && G.shake > 0 ? (Math.random() - 0.5) * G.shakeP : 0, sy = G && G.shake > 0 ? (Math.random() - 0.5) * G.shakeP : 0;
    camera.left = camX - VW / 2 + sx; camera.right = camX + VW / 2 + sx;
    camera.bottom = camBottom + sy; camera.top = camBottom + VH + sy;
    camera.updateProjectionMatrix();
    placeFg();
  }
  const toScreen = (x, y) => [((x - camera.left) / (camera.right - camera.left)) * innerWidth, (1 - (y - camera.bottom) / (camera.top - camera.bottom)) * innerHeight];

  // ── input: drag / wheel / keys pan the lane ────────────
  function bindInput() {
    const gl = document.getElementById('gl');
    let drag = null, pinch = null;
    const pts = new Map(); // touches on the field: one drags the lane, two pinch-zoom
    resetFieldInput = () => { drag = null; pinch = null; pts.clear(); };
    addEventListener('blur', resetFieldInput);
    const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2 }; };
    gl.style.touchAction = 'none';
    gl.addEventListener('pointerdown', (e) => {
      if (!G) return;
      pan = null;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { drag = null; const t = two(); pinch = { d: t.d, z: zoom }; } else if (pts.size === 1) drag = { x: e.clientX, cam: camX };
      G && (G.userCam = performance.now());
    });
    addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!G) return;
      if (pinch && pts.size >= 2) { const t = two(); setZoom(pinch.z * t.d / Math.max(1, pinch.d), t.x); return; }
      if (!drag) return;
      camX = drag.cam - (e.clientX - drag.x) / innerWidth * VW;
      clampCam(); updateCam(); G.userCam = performance.now(); // a long drag keeps the camera where the finger put it
    });
    const lift = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) { const p = [...pts.values()][0]; drag = { x: p.x, cam: camX }; } else drag = null; // the finger left behind keeps dragging
    };
    addEventListener('pointerup', lift);
    addEventListener('pointercancel', lift);
    gl.addEventListener('wheel', (e) => {
      if (!G) return;
      pan = null;
      e.preventDefault();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { // sideways scroll (trackpad) or shift: pan
        camX += (e.deltaX || e.deltaY) * 0.01; clampCam(); updateCam(); G.userCam = performance.now();
        return;
      }
      setZoom(zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.001)), e.clientX); // wheel: zoom about the cursor (ctrl = trackpad pinch)
    }, { passive: false });
    addEventListener('keydown', (e) => {
      if (!G || G.over) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { pan = null; camX += e.key === 'ArrowLeft' ? -1 : 1; clampCam(); updateCam(); G.userCam = performance.now(); }
      const n = '1234567890'.indexOf(e.key);
      if (n >= 0) deploy(n);
      if (e.key === 'e' || e.key === 'E') upgradeWorker();
      if (e.key === 'f' || e.key === 'F' || e.key === ' ') { e.preventDefault(); fireCannon(); }
    });
  }

  // ── battle ─────────────────────────────────────────────
  // stage: a stage object (campaign / hard / infinite floor) or a campaign index
  // music: a battle theme per chapter, a boss theme per boss (the Iron Prince has its own)
  const BATTLE_BGM = ['battle', 'battle2', 'battle3', 'battle4'];
  const battleMusic = (st) => (st.infinite ? 'battle4' : BATTLE_BGM[st.chapter % BATTLE_BGM.length]);
  const bossMusic = (st) => (st.boss && st.boss.e === 'IronPrince_N' ? 'ironprince' : st.infinite ? 'boss3' : ['boss', 'boss2', 'boss3'][st.chapter % 3]);
  const OUR_BASE = 'base_orca'; // the Orca's AGS Fortress rig (tools/build_sd.py EXTRA)
  // infinite-front buffs carried by the stage object: count of one kind
  const buffN = (st, id) => (st.buffs || []).filter((b) => b === id).length;
  const stageOf = (s) => (typeof s === 'number' ? D.STAGES[s] : s);
  function rigIds(stage, deck) {
    const st = stageOf(stage);
    const enemies = new Set([D.BASE_RIG, ...st.spawns.map((s) => s[0])]);
    if (st.boss) enemies.add(st.boss.e);
    if (st.rush) st.rush.spawns.forEach((s) => enemies.add(s[0]));
    return [OUR_BASE, ...deck.map((u) => u.id), ...[...enemies].map((e) => 'e_' + e)];
  }

  // load every rig of the stage (progress 0..1)
  async function preload(stage, deck, onProgress) {
    const ids = rigIds(stage, deck);
    const fx = [...new Set(deck.flatMap((u) => ['atk', 'skill'].flatMap((c) => { const o = origFor(u.id, c); return o ? [o.bullet, o.hit, ...o.statics] : []; })).filter(Boolean))];
    let done = 0;
    const total = ids.length + fx.length;
    await Promise.all([
      ...ids.map((id) => SD.prepare(id).then((t) => { if (t && renderer.initTexture) renderer.initTexture(t.atlas.tex); onProgress(++done / total); })),
      ...fx.map((n) => FXB.prepare(n).then(() => onProgress(++done / total))),
    ]);
  }

  // deck: [{ def, lv }]
  function start(stage, deck, hooks) {
    stop();
    const st = stageOf(stage);
    G = {
      ix: st.ix, st, len: st.len, deck, hooks, t: 0, speed: 1, paused: false, over: null, overT: 0,
      allies: [], enemies: [], fx: [], texts: [], bfx: [], sfx: [],
      syn: new Set(D.synergiesOf(deck.map((d) => d.def))), kills: 0, deploys: 0, skillsUsed: 0,
      money: (st.startMoney || 0) + 300 * buffN(st, 'money'), worker: 0, cannon: 0, cannonFire: null,
      cds: deck.map(() => 0),
      base: { hp: 0, max: 0 }, ebase: { hp: st.baseHp, max: st.baseHp },
      spawns: st.spawns.map((s) => ({ e: s[0], next: s[1], every: s[2], left: s[3] || Infinity, mag: s[4] })),
      bossDone: !st.boss, rushDone: !st.rush, userCam: false, root: new THREE.Group(),
    };
    G.base.hp = G.base.max = Math.round(3000 * st.pow / 100) * 100;
    if (G.syn.has('lean')) G.worker = 1; // 소수 정예: work efficiency starts at Lv2
    scene.add(G.root);
    zoom = 1; view();
    buildField();
    camX = -100; clampCam(); updateCam();
    AUDIO.music(battleMusic(st));
    AUDIO.ambience(st.bg);
    AUDIO.preload([...new Set(deck.map((d) => d.def.sfx)), 'expS', 'expM', 'gun', 'swing', 'cannon', 'beam', 'laserBig', 'warning', 'win']);
    AUDIO.play('start');
  }

  function stop() {
    pan = null;
    resetFieldInput();
    document.body.classList.remove('cine', 'finale-on');
    { const el = document.getElementById('finale'); if (el) el.className = 'finale'; }
    AUDIO.ambience(null);
    if (!G) return;
    [...G.allies, ...G.enemies].forEach(disposeFighter);
    G.bfx.forEach((b) => b.inst.dispose()); G.sfx.forEach((f) => f.dispose());
    if (window.SDPS) SDPS.clear(); // original projectiles / hit effects in flight
    if (G.baseRig) G.baseRig.dispose();
    if (G.ourRig) G.ourRig.dispose();
    scene.remove(G.root);
    G.root.traverse((o) => { if (o.material && o.material.map && o.material.map.ownedByField) o.material.map.dispose(); if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); });
    G = null;
  }

  const BG_GROUND = { bg_field: 0.3, bg_city: 0.33, bg_base: 0.3 }; // where the walkable ground is in each picture
  function buildField() {
    const key = G.st.bg;
    const t = new THREE.TextureLoader().load(IMG[key]);
    t.ownedByField = true;
    t.wrapS = THREE.MirroredRepeatWrapping;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, depthTest: false, depthWrite: false }));
    bg.renderOrder = 0;
    G.root.add(bg);
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000814, transparent: true, opacity: 0.15, depthTest: false }));
    tint.renderOrder = 1;
    G.root.add(tint);
    G.bg = { mesh: bg, tint, tex: t, gf: BG_GROUND[key] || 0.28 };
    G.fg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: fgTexture(key), transparent: true, depthTest: false, depthWrite: false }));
    G.fg.renderOrder = 1400; // in front of the fighters, under the effects
    G.root.add(G.fg);
    // the walkable lane: a soft dark band with a faint edge, so the fighting line reads on every background
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(G.len + 8, 1.6), new THREE.MeshBasicMaterial({ map: tex.beam, color: 0x000000, transparent: true, opacity: 0.32, depthTest: false }));
    lane.position.set(G.len / 2, 0, -4); lane.renderOrder = 2;
    G.root.add(lane);
    for (const y of [-0.62, 0.62]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(G.len + 8, 0.03), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.12, depthTest: false }));
      edge.position.set(G.len / 2, y, -4); edge.renderOrder = 3;
      G.root.add(edge);
    }
    fitBg();

    // our base: the Orca's AGS Fortress rig (the drawn tower if the rig is missing)
    const ours = SD.create(OUR_BASE);
    if (ours) {
      const tp = SD.template(OUR_BASE);
      const k = 3.4 / tp.height;
      ours.root.scale.set(k, k, 1);
      ours.root.position.set(-(tp.box.min.x + tp.box.max.x) / 2 * k, -tp.box.min.y * k, 0);
      const h = new THREE.Group();
      h.position.set(-1.1, -0.15, 0); // the AGS rig already faces right, towards the worms
      h.add(ours.root);
      ours.mesh.renderOrder = 20;
      ours.play('idle', null, true);
      G.root.add(h);
      G.ourRig = ours;
    } else {
      const bm = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.9), new THREE.MeshBasicMaterial({ map: tex.base, transparent: true, depthTest: false }));
      bm.position.set(-0.7, 1.75, 0); bm.renderOrder = 20;
      G.root.add(bm);
      G.baseMesh = bm;
    }
    addShadow(G.root, -0.7, 0, 3.6);

    // enemy base: the Iron Worm nest rig (Nest_B07), still
    const id = 'e_' + D.BASE_RIG;
    const c = SD.create(id);
    if (c) {
      const tp = SD.template(id);
      const k = 4.0 / tp.height;
      c.root.scale.set(k, k, 1);
      c.root.position.set(-(tp.box.min.x + tp.box.max.x) / 2 * k, -tp.box.min.y * k, 0);
      const h = new THREE.Group();
      h.position.set(G.len + 0.9, -0.15, 0);
      h.add(c.root);
      c.mesh.renderOrder = 20;
      c.setTint(0.95, 0.9, 0.9);
      c.play('idle', null, true);
      G.root.add(h);
      G.baseRig = c; G.baseHolder = h;
    }
    addShadow(G.root, G.len + 0.9, 0, 3.6);
  }

  // foreground: dark silhouettes (rubble, girders, crates, grass by background) along the bottom of the view,
  // drawn once on a canvas and scrolled a little faster than the lane, so the space under the fight has depth
  function fgTexture(kind) {
    const W = 2048, H = 512, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    let seed = kind.length * 977;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const base = H * 0.62;
    // two tones tinted to the stage: a lighter back row, a darker front row; the ground below fades only part way
    const TONE = { bg_field: ['#1d2a14', '#0c1409', '20,30,12'], bg_city: ['#1c2430', '#0b0f15', '12,16,22'], bg_base: ['#1e242c', '#0c0f13', '12,15,19'] }[kind] || ['#1c2430', '#0b0f15', '12,16,22'];
    const grd = g.createLinearGradient(0, base - 40, 0, H);
    grd.addColorStop(0, `rgba(${TONE[2]},0)`); grd.addColorStop(0.4, `rgba(${TONE[2]},0.45)`); grd.addColorStop(1, `rgba(${TONE[2]},0.68)`);
    g.fillStyle = grd; g.fillRect(0, base - 40, W, H);
    g.fillStyle = TONE[0];
    for (let x = -40; x < W; x += 120 + rnd() * 200) { // back row
      const w = 160 + rnd() * 260, h = 50 + rnd() * 70;
      g.beginPath(); g.moveTo(x, H); for (let k = 0; k <= 8; k++) { const t = k / 8; g.lineTo(x + w * t, base + 10 - h * Math.sin(Math.PI * t)); } g.lineTo(x + w, H); g.fill();
    }
    g.fillStyle = TONE[1];
    const lump = (x, w, h) => { g.beginPath(); g.moveTo(x, H); for (let k = 0; k <= 8; k++) { const t = k / 8; g.lineTo(x + w * t, base + 30 - h * Math.sin(Math.PI * t) * (0.75 + rnd() * 0.5)); } g.lineTo(x + w, H); g.fill(); };
    for (let x = -60; x < W; x += 90 + rnd() * 160) lump(x, 140 + rnd() * 220, 30 + rnd() * 70); // the ground line
    for (let i = 0; i < 9; i++) {
      const x = (i + rnd() * 0.6) * (W / 9);
      if (kind === 'bg_field') { // grass tufts and stones
        for (let k = 0; k < 14; k++) { const gx = x + rnd() * 120, h = 40 + rnd() * 110; g.beginPath(); g.moveTo(gx - 6, base + 40); g.quadraticCurveTo(gx + rnd() * 30 - 15, base + 40 - h * 0.6, gx + rnd() * 40 - 20, base + 40 - h); g.lineTo(gx + 6, base + 40); g.fill(); }
        lump(x + 60, 110 + rnd() * 60, 60 + rnd() * 30);
      } else if (kind === 'bg_city') { // rubble, bent girders, a cone
        lump(x, 160, 70 + rnd() * 50);
        g.save(); g.translate(x + 70, base + 20); g.rotate(-0.5 - rnd() * 0.6); g.fillRect(-8, -150 - rnd() * 80, 16, 170); g.fillRect(-30, -150, 60, 12); g.restore();
        if (rnd() < 0.5) { g.beginPath(); g.moveTo(x + 140, base + 40); g.lineTo(x + 160, base - 30); g.lineTo(x + 180, base + 40); g.fill(); }
      } else { // crates, pipes and a hazard rail
        const w = 90 + rnd() * 60, h = 70 + rnd() * 60;
        g.fillRect(x, base + 40 - h, w, h + 200); g.fillRect(x + w * 0.6, base + 40 - h - 50, w * 0.6, h + 250);
        g.fillRect(x - 40, base - 10, 260, 14);
        g.fillStyle = 'rgba(255,204,0,0.18)'; for (let k = 0; k < 6; k++) g.fillRect(x - 40 + k * 44, base - 10, 22, 14); g.fillStyle = TONE[1];
      }
    }
    // a faint rim of light on the top edges (the battlefield glow)
    g.globalCompositeOperation = 'source-atop';
    const rim = g.createLinearGradient(0, base - 200, 0, base + 60);
    rim.addColorStop(0, 'rgba(120,170,220,0.22)'); rim.addColorStop(0.6, 'rgba(120,170,220,0.04)'); rim.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rim; g.fillRect(0, 0, W, base + 60);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.ownedByField = true;
    return t;
  }
  function placeFg() {
    if (!G || !G.fg) return;
    // one picture = 1.25 world units tall with its ground line 38% up: the silhouettes stay under the fighters' feet;
    // the plane reaches down to the bottom of the view and the picture's dark bottom row is stretched (clamped) there
    const ground = -1.75, h = 1.25, top = ground + h * 0.62, Hp = Math.max(h, top - camBottom + 0.2);
    const width = G.len + 60;
    G.fg.scale.set(width, Hp, 1);
    G.fg.position.set(G.len / 2 - camX * 0.18, top - Hp / 2, 0); // scrolls 18% faster than the lane
    const m = G.fg.material.map;
    m.repeat.set(width / (h * 4), Hp / h);
    m.offset.set(0, 1 - Hp / h);
  }

  // the picture spans the view height with its walkable band on the lane (y = 0); it repeats (mirrored) along x
  function fitBg() {
    if (!G || !G.bg) return;
    // Both the plane and its UVs stay fixed throughout the entire zoom range.
    // Cover the widest camera up front; only the camera scales the background.
    const b = G.bg, aspect = innerWidth / innerHeight;
    const viewHeight = Math.max(8.5, Math.min(10.5, 11 / aspect));
    const groundFrac = hudFrac >= 0 ? Math.max(0.24, Math.min(0.44, hudFrac + 0.06)) : aspect < 1 ? 0.38 : 0.37;
    const widestHeight = viewHeight / zMin();
    // Fit the actual source picture to the widest view, not the default view.
    // UVs must stay inside the picture: clamping outside it stretches tree trunks
    // and buildings into vertical streaks above the image at low zoom.
    const H = Math.max((widestHeight * (1 - groundFrac) + 0.2) / (1 - b.gf), (0.2 + widestHeight * groundFrac) / b.gf);
    const width = G.len + 40;
    b.tex.wrapT = THREE.ClampToEdgeWrapping;
    b.tex.repeat.set(width / H, 1);
    b.tex.offset.y = 0;
    for (const m of [b.mesh, b.tint]) { m.scale.set(width, H, 1); m.position.set(G.len / 2, H * (0.5 - b.gf), -5); }
  }

  function addShadow(parent, x, y, w) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthTest: false, depthWrite: false }));
    m.scale.set(w, w * 0.22, 1); m.position.set(x, y, 0); m.renderOrder = 5;
    parent.add(m);
    return m;
  }

  // ── fighters ───────────────────────────────────────────
  function makeFighter(side, def, sdId, x, mag) {
    const ally = side === 1;
    const dy = (Math.random() - 0.5) * 1.1; // depth spread: the crowd reads as ranks, not one blob
    const f = {
      side, ally, def, sdId, x, dy, dir: ally ? 1 : -1,
      hp: def.hp * mag, maxHp: def.hp * mag, atk: def.atk * mag,
      state: 'walk', cool: 0, act: null, kb: null, kbN: 0, slowT: 0, slowK: 0, flashT: 0, attacks: 0, dead: false, deadT: 0,
      holder: new THREE.Group(), sd: null,
    };
    f.holder.position.set(x, dy, 0);
    const t = SD.template(sdId);
    // allies keep the original rigs' relative sizes (one scale for all, as in the defence game); monsters use their data height
    const k = t ? (ally ? ALLY_K : (def.h * UNIT_SCALE) / t.height) : 1;
    f.h = ally ? Math.min(2.2, t ? t.height * ALLY_K / UNIT_SCALE : 1.5) : def.h; // body height for effects / labels
    f.shadow = addShadow(f.holder, 0, 0, f.h * 0.75);
    G.root.add(f.holder);
    const c = SD.acquire(sdId); // pooled for allies too: no typed arrays / materials per deploy
    if (c) {
      if (RIG_HIDE[sdId] && c.hideNodes) c.hideNodes(RIG_HIDE[sdId]);
      if (c.hideNodes) c.hideNodes(SCREEN_FX); // the original's full-screen dimmers (a black quad behind a skill) aren't part of the unit
      if (def.fly && c.hideNodes) c.hideNodes(/shadow/i); // a flyer's own baked shadow would float under it: ours sits on the lane
      c.root.scale.set(k, k, 1);
      // allies stand on the rig's own ground pivot (drones / big weapons would shift the bounds), monsters on their bounds
      if (ally) c.root.position.set(-c.W[9] * k, -c.W[10] * k, 0);
      else c.root.position.set(-(t.box.min.x + t.box.max.x) / 2 * k, -t.box.min.y * k, 0);
      c.play('move', null, true);
      c.time = Math.random() * 0.4;
      f.holder.add(c.root);
      f.sd = c;
    }
    f.zo = 100 + Math.round((0.6 - dy) * 600);
    if (f.sd) f.sd.setOrder(f.zo);
    f.manual = ally && !!SKILL[def.rank]; // S / SS skills are ordered by the player
    f.skillCharge = f.manual ? SKILL[def.rank].charge : 0;
    f.charge = 0;
    f.shadow.renderOrder = 6;
    return f;
  }

  function disposeFighter(f) {
    if (f.sd) { SD.release(f.sd); f.sd = null; }
    f.shadow.material.dispose(); f.shadow.geometry.dispose();
    f.holder.parent && f.holder.parent.remove(f.holder);
  }

  // an SS fights alone: one of each on the field at a time (a fallen one can be sent again)
  const onField = (def) => def.rank === 'SS' && G.allies.some((a) => !a.dead && a.def.id === def.id);
  function deploy(i) {
    if (!G || G.over || G.paused) return false;
    const slot = G.deck[i];
    if (!slot) return false;
    const def = slot.def;
    if (G.cds[i] > 0 || G.money < def.cost) { AUDIO.play('fail', 0.6); return false; }
    if (G.allies.length >= 40) { toast('필드가 가득 찼습니다'); return false; }
    if (onField(def)) { toast(`${def.name}은(는) 이미 출격 중입니다 (SS는 한 명씩)`); AUDIO.play('fail', 0.6); return false; }
    G.money -= def.cost;
    G.cds[i] = def.cd * Math.pow(0.88, buffN(G.st, 'cd')) * (G.syn.has('lean') ? 0.7 : 1) *
      (G.syn.has('tide') && (def.id === 'undine' || def.id === 'thetis') ? 0.75 : 1);
    const f = makeFighter(1, def, def.id, 0.9, D.lvMul(slot.lv)); // slot.lv: battle level (levels above the card's start)
    f.atk *= 1 + 0.12 * buffN(G.st, 'atk'); f.hp = f.maxHp = f.maxHp * (1 + 0.15 * buffN(G.st, 'hp'));
    // squad synergies (data.js SYNERGIES)
    const t = def.type;
    const S = G.syn, id = def.id;
    if (S.has('bulwark') && (t === 'wall' || t === 'melee')) f.hp = f.maxHp = f.maxHp * (S.has('bulwark2') ? 1.4 : 1.2);
    if (S.has('bulwark2') && (t === 'wall' || t === 'melee')) f.kbRes = 0.5;
    if (S.has('chain') && t === 'chain') f.atk *= 1.2;
    if (S.has('volley') && t === 'single') f.atk *= S.has('volley2') ? 1.3 : 1.15;
    if (S.has('eagle') && t === 'snipe') f.range = def.range + 0.6;
    if (S.has('ace') && f.manual) f.skillCharge *= 0.85;
    if (S.has('flame') && (id === 'impet' || id === 'phoenix')) f.atk *= 1.25;
    if (S.has('tide') && (id === 'undine' || id === 'thetis')) f.slowMul = 1.5;
    if (S.has('wings') && (id === 'raven' || id === 'hraesvelgr')) { f.range = (f.range || def.range) + 0.5; f.atk *= 1.1; }
    if (S.has('shore') && (id === 'brownie' || id === 'leprechaun' || id === 'gnome')) { f.atk *= 1.12; f.hp = f.maxHp = f.maxHp * 1.12; }
    if (S.has('command')) f.hp = f.maxHp = f.maxHp * 1.08;
    if (S.has('grunt')) { f.atk *= 1.2; f.hp = f.maxHp = f.maxHp * 1.15; }
    G.deploys++;
    G.allies.push(f);
    const fy = flyY(f); // a flyer's deploy flash and aura are where it hovers (the gold ring stays on the ground)
    burst(0.9, f.dy + fy + f.h * 0.4, 0x48d8ff, 1.4, 0.35);
    if (def.rank === 'SS') { sheet('aura', 0.9, f.dy + fy + f.h * 0.7, 0xffd200, f.h * 2.2, 0.6); ring(0.9, f.dy + 0.1, 0xffd200, 3, 0.5); shake(0.08, 0.2); }
    AUDIO.play('deploy', 0.6);
    if (window.BARK && BARK[def.id]) AUDIO.voice(BARK[def.id].deploy, 'over'); // every deploy, overlapping
    return true;
  }

  function spawnEnemy(eid, mag, boss) {
    const def = Object.assign({ id: eid }, D.ENEMIES[eid]);
    const f = makeFighter(-1, def, 'e_' + eid, G.len - 0.6, mag * (G.st.pow || 1));
    f.atk *= window.TUNE_EATK || 1.4; // monsters hit harder than their HP scale suggests: the line has to be held
    if (def.shield) f.shield = f.maxHp * def.shield;
    f.money = Math.round(def.money * (0.8 + 0.2 * mag) * (0.6 + 0.4 * Math.min(3, G.st.pow || 1))); // tougher stages pay more (up to the campaign's top)
    if (boss) f.boss = true;
    G.enemies.push(f);
    return f;
  }

  const opp = (f) => (f.ally ? G.enemies : G.allies);
  const baseFront = (f) => (f.ally ? G.len - BASE_W : BASE_W);
  function reach(f, x) { const d = (x - f.x) * f.dir; return d >= -0.5 && d <= (f.range || f.def.range); }
  // artillery worms shell our base from twice their reach, over the line
  const baseReach = (f) => { const d = (baseFront(f) - f.x) * f.dir; return d >= -0.5 && d <= f.def.range * (f.def.artillery ? 2 : 1); };

  // nearest living opponent in reach (or the base)
  // flyers (either side) are out of reach for short-range units (walls / melee)
  const ANTI_AIR = 2.4;
  // flyers keep a clear band above the ground fight (their shadow stays on the lane)
  const FLY_H = 2.2; // above the ground fighters' heads, low enough that a flyer stays inside short (landscape) views
  const flyY = (o) => (o.def.fly ? FLY_H + (o.cy || 0) : 0); // + its rank in a stacked group of flyers
  const aimY = (o) => o.dy + flyY(o) + o.h * 0.5; // the middle of the body as drawn
  const canHit = (f, o) => !(o.def.fly && f.def.range < ANTI_AIR);
  function target(f) {
    let best = null, bd = Infinity;
    if (!f.ally && f.def.artillery && baseReach(f)) return 'base';
    for (const o of opp(f)) {
      if (o.dead || !reach(f, o.x) || !canHit(f, o)) continue;
      // diving flyers pass over units that cannot hit them
      if (f.def.dive && !f.ally && o.def.range < ANTI_AIR) continue;
      const d = (o.x - f.x) * f.dir;
      if (d < bd) { bd = d; best = o; }
    }
    if (best) return best;
    return baseReach(f) ? 'base' : null;
  }

  // does this clip switch on any of the rig's particle effects (a node with a ParticleSystem, or an ancestor of one)?
  function clipHasPs(f, name) {
    const tp = f.sd && f.sd.tpl;
    if (!tp || !f.sd.ps) return false;
    const cache = tp.psClip || (tp.psClip = {});
    if (name in cache) return cache[name];
    const nodes = tp.data.nodes, anc = new Set();
    nodes.forEach((n, i) => { if (n.ps && !n.ps.det) { for (let p = i; p >= 0; p = nodes[p].p) anc.add(p); } });
    nodes.forEach((n, i) => { if (n.ps && n.ps.det) { for (let p = i; p >= 0; p = nodes[p].p) anc.add(p); } });
    const c = tp.data.clips[name];
    cache[name] = !!(c && c.tracks.some((t) => t.k === 'a' && anc.has(t.i) && t.i !== 0));
    return cache[name];
  }
  function clipDur(f, name) {
    const c = f.sd && f.sd.tpl.data.clips[name];
    return c ? c.dur : 0.8;
  }

  function startAttack(f) {
    f.attacks++;
    // SS: the skill fires when the commander orders it (charged, slot button); others every n-th attack
    // S / SS: the skill fires by itself on the first attack after its charge is full (each copy on the field charges on its own)
    const ordered = (f.order || (f.manual && f.charge >= f.skillCharge)) && f.sd && f.sd.has('skill');
    const skill = ordered || (!f.manual && f.def.skill && f.attacks % f.def.skill === 0 && f.sd && f.sd.has('skill'));
    if (ordered) { f.order = false; f.charge = 0; G.skillsUsed++; cutIn(f); }
    const name = skill ? 'skill' : 'atk';
    const dur = clipDur(f, name);
    const want = f.def.rate * (skill ? 1.6 : 0.92);
    const sp = Math.max(1, Math.min(ATK_SPEED_MAX, dur / want));
    const cycle = dur / sp;
    const ev = f.ally && window.ANIM_EV && ANIM_EV[f.def.id] && ANIM_EV[f.def.id][name];
    // hit times from the clip's events, with the fire point (muzzle #) each one leaves from
    let idx = ev && ev.t.length ? ev.t.map((_, i) => i).filter((i) => ev.t[i] / sp < cycle) : [];
    if (idx.length > 8) { const k = idx.length / 8; idx = Array.from({ length: 8 }, (_, i) => idx[Math.floor(i * k)]); }
    let hits = idx.map((i) => ev.t[i] / sp);
    const fn = idx.map((i) => (ev.f ? ev.f[i] : 1));
    if (!hits.length) hits = [cycle * (f.ally ? 0.4 : 0.45)];
    const mult = ordered ? SKILL[f.def.rank].mult : skill ? 2.6 : 1;
    if (ordered) telegraph(f, hits[0] || cycle * 0.4);
    f.act = { t: 0, cycle, hits, fn, i: 0, per: (f.atk * mult) / hits.length, skill };
    // the original's move-to-target attacks (EventMoveMotion start / arrive / leave / home): the unit flies up to its
    // target and back, drawn only (the simulation keeps its x); it stops one unit short of the target
    if (ev && ev.mv) {
      const tg = target(f), tx = tg && tg !== 'base' ? tg.x : tg === 'base' ? baseFront(f) : null;
      const dist = tx == null ? 0 : Math.max(0, (tx - f.x) * f.dir - 1.0);
      if (dist > 0.2) f.act.mv = { at: ev.mv.map((x) => x / sp), dist };
    }
    f.cool = Math.max(f.def.rate, cycle);
    f.state = 'atk';
    if (f.sd) { f.sd.play(name, null, false); f.sd.speed = sp; }
    if (skill) {
      sheet('aura', f.x, f.dy + flyY(f) + f.h * 0.7, f.def.color || 0xffffff, f.h * 1.8, 0.5); // on the unit, flyers included
      AUDIO.play('charge', 0.7);
      if (f.ally) {
        text(f.x, f.dy + flyY(f) + f.h + 0.6, 'SKILL!', '#ffd200', 1.4);
        if (window.BARK && BARK[f.def.id]) AUDIO.voice(BARK[f.def.id].skill, true);
      }
    }
  }

  // skills that come down from the sky: the landing hits the ground hard (Labiata's 백화요란)
  const SLAM = { labiata: 0xffd36e };
  function slam(f, x) {
    const c = SLAM[f.def.id];
    sheet('aura', x, 1.6, c, 6, 0.6); sheet('burst', x, 0.8, 0xffffff, 4.2, 0.25);
    sheet('smoke', x - 1, 0.5, 0xd8c8a8, 3.4, 0.9, { grow: 0.6 }); sheet('smoke', x + 1, 0.5, 0xd8c8a8, 3.4, 0.9, { grow: 0.6 });
    ring(x, 0.05, c, 7, 0.55); ring(x, 0.05, 0xffffff, 4, 0.35);
    debris(x, 0.4, 14, c);
    shake(0.6, 0.6); hitstop(0.12);
    AUDIO.play('expB', 0.9);
  }
  function hit(f) {
    const a = f.act;
    if (a.skill && f.ally && SLAM[f.def.id] && a.i === 0) { const t = target(f); slam(f, t && t !== 'base' ? t.x : f.x + f.dir * 1.5); }
    const area = f.def.area || a.skill;
    let any = false;
    const orig = f.ally && origFor(f.def.id, a.skill ? 'skill' : 'atk');
    const mz = muzzle(f, a.fn && a.fn[a.i] != null ? a.fn[a.i] : 1); // where this shot leaves the weapon
    // a skill that fires its bullet and also throws an effect (Constantia: Bori charges in and rams the target):
    // the thrown effect plays once, on the ground at the target, as the original's EventThrowEffect
    if (orig && orig.bullet && orig.statics.length && a.skill && a.i === 0) {
      const t = target(f), tx = t && t !== 'base' ? t.x : f.x + f.dir * 3;
      spawnStatic(orig.statics[0], tx, t && t !== 'base' ? t.dy || 0 : 0, ALLY_K);
    }
    const psLive = !!(f.ally && clipHasPs(f, a.skill ? 'skill' : 'atk')); // the original's own effects belong to this clip
    let shots = 0;
    const hitOne = (o) => {
      damage(o, a.per, f);
      if (a.skill && f.ally && shots === 0) { text(o.x, aimY(o) + o.h * 0.5 + 0.2, fmtDmg(a.per), '#fff2a8', 1.2); hitstop(0.05); }
      if (f.def.slow) { o.slowT = f.def.slow[1] * (o.boss ? 0.5 : 1) * (f.slowMul || 1); o.slowK = f.def.slow[0]; }
      // the original projectile / effect (one or two per volley), else the effect sheets
      // the rig's own original particle effects (muzzle fire, hit bursts) are playing: they are the look, no stand-ins
      const own = f.ally && f.sd && f.sd.tpl.data.shots && f.sd.tpl.data.shots[a.skill ? 'skill' : 'atk'];
      const hitTree = f.ally && f.sd && f.sd.tpl.data.hits && f.sd.tpl.data.hits[a.skill ? 'skill' : 'atk'] && f.sd.tpl.data.hits[a.skill ? 'skill' : 'atk'].t;
      if (own && !(orig && orig.bullet) && shots < 2 && window.SDPS) { // the original projectile, from the rig's own export
        SDPS.shot(f.sd, own, mz, [o.x, aimY(o)], G.root, Math.abs(f.sd.root.scale.y) || 1, f.dir, 1400);
      } else if (orig && shots < 2 && origShot(f, orig, o.x, aimY(o), mz)) {
        // the original bullet is small and quick: a flash at the barrel shows where it left
        if (orig.bullet && shots === 0) sheet('flash', mz[0] + f.dir * 0.08, mz[1], f.def.color || 0xffd27a, 0.7, 0.08);
        // an original effect that only plays on the target (no bullet): a ranged unit still shows the shot leaving it
        if (!orig.bullet && !psLive && f.def.range >= ANTI_AIR && shots === 0) { sheet('flash', mz[0], mz[1], f.def.color || 0xffffff, 0.7, 0.1); streak(mz[0], mz[1], o.x, aimY(o), f.def.color || 0xffffff, 0.22, 0.2); }
      } else if (hitTree && window.SDPS) { // the clip's own hit effect (EventHit), on the target
        if (shots < 2) SDPS.burst(f.sd, hitTree, [o.x, aimY(o)], G.root, Math.abs(f.sd.root.scale.y) || 1, f.dir, 1400);
      } else if (!psLive) hitFx(f, o.x, aimY(o), mz); // stand-in sheets only when the original has no effect of its own here
      else if (shots < 2 && f.def.range >= ANTI_AIR) { // an instant hit (no projectile): the original's hit flash on the target
        sheet('hit', o.x + (Math.random() - 0.5) * 0.3, aimY(o) + (Math.random() - 0.5) * 0.4, f.def.color || 0xffffff, 1.0, 0.22);
      }
      shots++;
      any = true;
    };
    if (area) {
      for (const o of opp(f).slice()) if (!o.dead && reach(f, o.x) && canHit(f, o)) hitOne(o);
    } else {
      const t = target(f);
      if (t && t !== 'base') hitOne(t);
    }
    // the base takes hits when in reach and (single target) nothing stands in front of it
    if (baseReach(f) && (area || !any || f.def.artillery)) {
      const b = f.ally ? G.ebase : G.base;
      const shell = f.def.artillery && !f.ally && !reach(f, baseFront(f)); // shelling from afar hits at half
      if (f.def.artillery && !f.ally) { sheet('smoke', baseFront(f) - 0.3, 1 + Math.random() * 2, 0xff8855, 2, 0.5, { grow: 0.5 }); shake(0.08, 0.15); }
      b.hp = Math.max(0, b.hp - a.per * (shell ? 0.5 : 1));
      b.flash = 0.12;
      if (!psLive) hitFx(f, baseFront(f) + f.dir * 0.4, 1.4 + Math.random(), mz);
      any = true;
    }
    if (any || a.i === 0) attackSfx(f);
  }

  function damage(o, dmg, src) {
    if (o.dead) return;
    // armour halves area / splash damage; snipers pierce it (x1.5)
    if (src && src.ally && o.slowT > 0 && G.syn.has('chill')) dmg *= 1.2;
    if (o.def.armor && src && src.ally) dmg *= src.def.type === 'snipe' ? 1.5 : src.def.area ? 0.5 : 1;
    // shield: soaks its share before the hull takes damage (shown as a blue ring)
    if (o.shield > 0) {
      const sh = Math.min(o.shield, dmg); o.shield -= sh; dmg -= sh;
      if (Math.random() < 0.5) sheet('hit', o.x + o.dir * 0.3, aimY(o), 0x8fb8ff, o.h * 0.9, 0.18); // the shield takes it: blue flash
      if (o.shield <= 0) { sheet('blue', o.x, aimY(o), 0x9fe8ff, o.h * 1.8, 0.4); text(o.x, aimY(o) + o.h * 0.5 + 0.4, 'SHIELD BREAK', '#b9d4ff', 1.1); AUDIO.play('elec', 0.5); }
    }
    // armour shrugs splash off: grey sparks and a ping
    if (o.def.armor && src && src.ally && src.def.area && src.def.type !== 'snipe' && Math.random() < 0.4) { sheet('spark', o.x, aimY(o) + o.h * 0.1, 0xd8d8d8, 0.8, 0.2); AUDIO.play('handgun', 0.25); }
    o.hp -= dmg;
    o.flashT = 0.08;
    const kbAt = (n) => o.maxHp * (1 - n / o.def.kb);
    if (o.hp <= 0) {
      o.hp = 0;
      die(o, src);
    } else if (o.hp <= kbAt(o.kbN + 1)) {
      while (o.kbN < o.def.kb - 1 && o.hp <= kbAt(o.kbN + 1)) o.kbN++;
      knockback(o, 1.3);
    }
  }

  function knockback(o, dist, dur = 0.5) {
    dist *= 1 - (o.kbRes || 0); // 철벽 전열 II
    if (o.dead && o.state !== 'dying') return;
    const lo = 0.4, hi = G.len - 0.4;
    o.act = null;
    o.state = o.dead ? 'dying' : 'kb';
    o.kb = { t: 0, dur, from: o.x, to: Math.max(lo, Math.min(hi, o.x - o.dir * dist * (o.boss ? 0.5 : 1))) };
    if (o.sd) { o.sd.speed = 1; o.sd.play('idle', null, true); }
  }

  function die(o, src) {
    o.dead = true;
    o.state = 'dying';
    knockback(o, 1.6, 0.55);
    if (!o.ally) {
      G.kills++;
      const m = o.money || 0;
      G.money = Math.min(wallet(), G.money + m);
      text(o.x, aimY(o) + o.h * 0.5 + 0.3, '+' + m, '#ffd35a');
      if (o.boss) {
        AUDIO.play('expB'); AUDIO.music(battleMusic(G.st)); shake(0.35, 0.6); hitstop(0.12);
        sheet('aura', o.x, o.dy + 2, 0xffaa33, 5, 0.8); sheet('smoke', o.x, o.dy + 1.2, 0xffcc88, 4.5, 0.9, { grow: 0.6 });
      } else if (o.h > 1.8) AUDIO.play('expS', 0.5);
      sheet('smoke', o.x, aimY(o) - o.h * 0.05, 0xffb080, o.h * 1.5, 0.55, { grow: 0.5 });
      debris(o.x, aimY(o), Math.round(3 + o.h * 2), 0xffc070);
      sheet('burst', o.x, aimY(o), 0xffd080, o.h * 1.2, 0.2);
    } else {
      sheet('hit', o.x, aimY(o), 0x9fe8ff, o.h * 1.3, 0.3);
    }
  }

  function attackSfx(f) {
    if (f.ally) AUDIO.play(f.def.sfx || 'rifle', 0.5);
    else AUDIO.play(f.def.range > 3 ? (f.def.area ? 'cannon' : 'gun') : 'swing', 0.35);
  }

  function update(dt) {
    G.t += dt;
    if (G.over) { // the battle is decided: the fallen still finish their knockback and fade out
      G.overT += dt;
      while (G.beats && G.beats.length && G.overT >= G.beats[0][0]) G.beats.shift()[1]();
      if (!G) return; // a beat ended the battle
      for (const list of [G.allies, G.enemies]) {
        for (let i = list.length - 1; i >= 0; i--) {
          const f = list[i];
          if (!f.dead) continue;
          stepFighter(f, dt);
          if (f.state === 'gone') { disposeFighter(f); list.splice(i, 1); }
        }
      }
      updateFx(dt);
      return;
    }
    // economy
    G.money = Math.min(wallet(), G.money + D.WORKER.rate[G.worker] * (G.st.incomeK || 1) * (1 + 0.15 * buffN(G.st, 'income')) * dt);
    G.cds = G.cds.map((c) => Math.max(0, c - dt));
    if (G.cannon < D.CANNON.charge) G.cannon = Math.min(D.CANNON.charge, G.cannon + dt * (G.st.cannonK || 1) / (1 - 0.2 * Math.min(3, buffN(G.st, 'cannon'))));
    updateCannon(dt);
    basePower(dt);
    spawner(dt);
    for (const f of G.allies) stepFighter(f, dt);
    for (const f of G.enemies) stepFighter(f, dt);
    for (const list of [G.allies, G.enemies]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const f = list[i];
        if (f.dead && f.state === 'gone') { disposeFighter(f); list.splice(i, 1); }
      }
    }
    if (G.base.flash) G.base.flash = Math.max(0, G.base.flash - dt);
    if (G.ebase.flash) G.ebase.flash = Math.max(0, G.ebase.flash - dt);
    updateFx(dt);
    if (G.ebase.hp <= 0) finish('win');
    else if (G.base.hp <= 0) finish('lose');
    else if (G.t >= TIME_LIMIT) finish('timeout'); // the stand-off ran out the operation's time
  }

  function stepFighter(f, dt) {
    if (f.flashT > 0) f.flashT -= dt;
    if (f.manual && !f.dead && f.charge < f.skillCharge) f.charge += dt;
    if (f.slowT > 0) f.slowT -= dt;
    const slow = f.slowT > 0 ? 1 - f.slowK : 1;
    if (f.kb) {
      const k = f.kb;
      k.t += dt;
      const u = Math.min(1, k.t / k.dur);
      f.x = k.from + (k.to - k.from) * (1 - (1 - u) * (1 - u));
      f.hop = Math.sin(u * Math.PI) * 0.55;
      if (u >= 1) {
        f.kb = null; f.hop = 0;
        if (f.dead) {
          f.state = 'fade'; f.deadT = 0;
          if (f.sd && f.sd.has('die')) f.sd.play('die', null, false);
        } else { f.state = 'walk'; f.cool = Math.max(f.cool, 0.3); }
      }
      return;
    }
    if (f.state === 'fade') {
      f.deadT += dt;
      if (f.boss) { // a boss burns red and sinks into the ground over two seconds
        const u = Math.min(1, f.deadT / 2);
        f.hop = -u * u * 1.4;
        if (f.sd) { f.sd.setTint(1.8 - u * 0.8, 0.55, 0.45); f.sd.setOpacity(1 - Math.max(0, u - 0.4) / 0.6); }
        f.shadow.material.opacity = 1 - u;
        if (f.deadT > 0.3 && !f.sunk) { f.sunk = true; sheet('aura', f.x, f.dy + 1.5, 0xff5533, 5, 1.2); }
        if (f.deadT > 2.05) f.state = 'gone';
        return;
      }
      const a = Math.max(0, 1 - Math.max(0, f.deadT - 0.5) / 0.5);
      if (f.sd) f.sd.setOpacity(a);
      f.shadow.material.opacity = a;
      if (f.deadT > 1.0) f.state = 'gone';
      return;
    }
    if (f.dead) return;
    f.cool -= dt * slow;
    if (f.state === 'atk') {
      const a = f.act;
      a.t += dt * slow;
      while (a.i < a.hits.length && a.t >= a.hits[a.i]) { hit(f); a.i++; if (f.dead || !f.act) return; }
      if (a.t >= a.cycle) { f.act = null; f.state = 'walk'; }
      else return;
    }
    const t = target(f);
    if (t) {
      if (f.cool <= 0) startAttack(f);
      else if (f.sd && f.sd.clipName !== 'idle') { f.sd.speed = 1; f.sd.play('idle', null, true); }
      return;
    }
    // walk: up to the base, and never into the opposing front line (the two sides hold a clear gap)
    let front = baseFront(f);
    if (!f.def.dive) {
      const GAP = 0.7;
      for (const o of opp(f)) {
        if (o.dead || o.def.fly || o.state === 'kb') continue;
        const stop = o.x - f.dir * GAP;
        if ((stop - f.x) * f.dir >= 0 && (stop - front) * f.dir < 0) front = stop;
      }
    }
    f.x += f.dir * f.def.spd * 0.85 * slow * (f.ally ? 1 : G.st.enemySpd || 1) * dt;
    if ((f.x - front) * f.dir > 0) f.x = front;
    if (f.sd && f.sd.clipName !== 'move') { f.sd.speed = 1; f.sd.play('move', null, true); }
    if (f.sd) f.sd.speed = slow;
  }

  // a stand-off past ENRAGE_AT seconds: every minute the worms come stronger and in larger numbers
  const ENRAGE_AT = 360;
  const TIME_LIMIT = 600; // seconds of battle time before the operation fails
  const enrage = () => Math.max(0, (G.t - ENRAGE_AT) / 60);

  function spawner(dt) {
    if (!G.enraged && G.t >= ENRAGE_AT) { G.enraged = true; toast('철충 폭주 — 시간이 지날수록 강해집니다', true); AUDIO.play('warning', 0.6); }
    const enemiesAlive = G.enemies.filter((e) => !e.dead).length;
    for (const s of G.spawns) {
      if (s.left <= 0 || G.t < s.next) continue;
      if (enemiesAlive >= MAX_ENEMIES + enrage() * 2 && !s.rush) { s.next = G.t + 1; continue; }
      spawnEnemy(s.e, s.mag * (1 + 0.25 * enrage()));
      s.left--;
      s.next = G.t + s.every * (0.85 + Math.random() * 0.3) * Math.max(0.5, 1 - G.t / 900); // a long stand-off tilts to the worms
    }
    const ratio = G.ebase.hp / G.ebase.max;
    if (!G.rushDone && ratio <= G.st.rush.at) {
      G.rushDone = true;
      G.st.rush.spawns.forEach((s) => G.spawns.push({ e: s[0], next: G.t + s[1], every: s[2], left: s[3] || Infinity, mag: s[4], rush: true }));
      toast('적 증원 부대 출현!', true);
      AUDIO.play('warning', 0.6);
    }
    if (!G.bossDone && ratio <= G.st.boss.at) {
      G.bossDone = true;
      const b = spawnEnemy(G.st.boss.e, G.st.boss.mag, true);
      G.boss = b;
      // the boss arrives with a shockwave that throws back the whole line
      G.allies.forEach((a) => { if (!a.dead) knockback(a, 2.2, 0.6); });
      ring(G.len - 1, 1.5, 0xff3355, 14, 0.8);
      sheet('aura', G.len - 1, 2, 0xff3355, 5, 0.7);
      shake(0.3, 0.7);
      if (G.hooks.onBoss) G.hooks.onBoss(b.def.name); else toast('보스 출현 — ' + b.def.name, true);
      AUDIO.play('warning');
      AUDIO.music(bossMusic(G.st));
      // reveal: the camera goes to the boss whatever the player was looking at, time slows and the screen letterboxes
      G.userCam = false; panTo(G.len - 1 - VW * 0.12);
      G.cine = 2.4;
      document.body.classList.add('cine');
    }
  }

  function finish(kind) {
    if (G.over) return;
    G.over = kind;
    G.overT = 0;
    if (kind === 'win') {
      G.enemies.forEach((e) => { if (!e.dead) die(e); });
      G.allies.forEach((a) => { if (!a.dead && a.sd) { a.act = null; a.sd.speed = 1; a.sd.play(a.sd.has('win') ? 'win' : 'idle', null, true); } });
      for (let i = 0; i < 7; i++) setTimeout(() => { if (!G) return; const x = G.len + 0.6 + (Math.random() - 0.5) * 2.5, y = 0.5 + Math.random() * 3; sheet('burst', x, y, 0xffcc66, 2.6, 0.25); sheet('smoke', x, y, 0xffaa55, 3.2, 0.7, { grow: 0.5 }); shake(0.25, 0.25); }, i * 220);
      if (G.baseRig && G.baseRig.has('die')) G.baseRig.play('die', null, false);
      setTimeout(() => { if (!G) return; sheet('aura', G.len + 0.8, 2.2, 0xffaa33, 7, 0.9); sheet('smoke', G.len + 0.8, 1.6, 0xffcc88, 7, 1.2, { grow: 0.6 }); shake(0.5, 0.8); AUDIO.play('expB'); }, 1500);
      AUDIO.play('expB'); AUDIO.music(''); AUDIO.play('win'); hitstop(0.2);
      setTimeout(() => AUDIO.play('clear', 0.9), 1300); // victory fanfare
      const mvp = G.allies.filter((a) => !a.dead).sort((a, b) => b.def.cost - a.def.cost)[0];
      if (mvp && window.BARK && BARK[mvp.def.id]) setTimeout(() => AUDIO.voice(BARK[mvp.def.id].win), 700);
      panTo(G.len - VW * 0.35);
      if (G.st.finale) finale();
    } else {
      for (let i = 0; i < 6; i++) setTimeout(() => { if (!G) return; const x = -0.7 + (Math.random() - 0.5) * 2, y = 0.5 + Math.random() * 3.5; sheet('burst', x, y, 0xff7744, 2.4, 0.25); sheet('smoke', x, y, 0xff6633, 3, 0.7, { grow: 0.5 }); shake(0.25, 0.25); }, i * 220);
      AUDIO.play('expB'); AUDIO.music('defeat'); hitstop(0.2);
      if (G.ourRig && G.ourRig.has('die')) G.ourRig.play('die', null, false);
      panTo(0);
    }
    const g = G; // only this battle's result: a restart during the ending must not receive it
    if (!(kind === 'win' && G.st.finale)) setTimeout(() => { if (G === g && G.hooks.onEnd) G.hooks.onEnd(kind); }, 2600); // the finale ends from its beats
  }

  // the last battle (8-10): the fortress goes down in a chain of blasts under letterbox bars, a white-out,
  // then the operation title before the result
  // beats on battle time (G.overT), so a slow phone or a paused tab can't show the title before the boss has sunk
  function finale() {
    G.speed = 1; // the ending plays at its own pace whatever the battle speed was
    document.body.classList.add('cine', 'finale-on');
    const beats = [];
    for (let i = 0; i < 18; i++) beats.push([0.4 + i * 0.19, () => {
      const x = G.len - 2 + Math.random() * 4, y = Math.random() * 4.5;
      sheet('burst', x, y, 0xffd27a, 2 + Math.random() * 1.6, 0.3); sheet('smoke', x, y, 0xffb070, 3, 0.9, { grow: 0.6 });
      debris(x, y, 6, 0xffc060); shake(0.3, 0.35); if (i % 3 === 0) AUDIO.play('expB', 0.7);
    }]);
    beats.push([4.0, () => { document.getElementById('finale').classList.add('flash'); AUDIO.play('expB'); shake(0.8, 1.2); hitstop(0.3); }]);
    beats.push([4.5, () => document.getElementById('finale').classList.add('show')]);
    beats.push([7.6, () => G.hooks.onEnd && G.hooks.onEnd('win')]);
    G.beats = beats;
  }

  // ── economy / cannon ───────────────────────────────────
  const wallet = () => D.WORKER.cap[G.worker];
  function upgradeWorker() {
    if (!G || G.over || G.worker >= D.WORKER.cost.length) return;
    const c = D.WORKER.cost[G.worker];
    if (G.money < c) { AUDIO.play('fail', 0.6); return; }
    G.money -= c;
    G.worker++;
    AUDIO.play('levelup', 0.7);
    text(BASE_C.x, 3.9, '발전 효율 LV ' + (G.worker + 1), G.worker >= D.WORKER.cost.length ? '#ffd65a' : '#5dff9b');
    // the base powers up: rings and sparks that grow with the level
    const col = powerColor(), k = 1 + G.worker * 0.15;
    ring(BASE_C.x, 0.1, col, 4 * k, 0.6); ring(BASE_C.x, BASE_C.y, 0xffffff, 3 * k, 0.4);
    sheet('flash', BASE_C.x, BASE_C.y, col, 3 * k, 0.25); sheet('aura', BASE_C.x, BASE_C.y + 0.4, col, 3.5 * k, 0.6);
    debris(BASE_C.x, BASE_C.y + 0.8, 8 + G.worker * 2, col);
    shake(0.08 + G.worker * 0.02, 0.25);
  }

  // ── the base reflects its power level (발전 효율): glow → rising motes → ground ring → arcs and a brighter hull,
  // gold at the last level ──
  const BASE_C = { x: -1.1, y: 1.6 };
  const powerColor = () => (G.worker >= D.WORKER.cost.length ? 0xffd04a : 0x48d8ff);
  function basePower(dt) {
    const lv = G.worker, max = D.WORKER.cost.length, col = powerColor();
    if (!G.basePw) {
      const glow = sprite(tex.glow, col); glow.renderOrder = 19; // behind the base (20)
      const halo = sprite(tex.ring, col); halo.renderOrder = 5;  // on the ground
      const aura = sprite(tex.glow, col); aura.renderOrder = 21; // a faint charge over the hull
      const shield = sprite(tex.ring, col); shield.renderOrder = 21; // LV6+: an energy bubble around it
      G.basePw = { glow, halo, aura, shield, mote: 0, arc: 0, t: 0 };
    }
    const P = G.basePw;
    P.t += dt;
    for (const m of [P.glow, P.halo, P.aura, P.shield]) m.material.color.setHex(col);
    const pulse = 0.5 + 0.5 * Math.sin(P.t * (2 + lv * 0.4));
    const gi = lv < 1 ? 0 : Math.min(0.85, 0.3 + lv * 0.08); // LV2+
    const gs = 6 + lv * 0.6 + pulse * 0.5;
    P.glow.position.set(BASE_C.x, BASE_C.y, 0); P.glow.scale.set(gs, gs * 1.1, 1); P.glow.material.opacity = gi * (0.75 + 0.25 * pulse);
    const hi = lv < 3 ? 0 : 0.35 + (lv - 3) * 0.1; // LV4+
    const hs = 4.6 + pulse * 0.5 + lv * 0.2;
    P.halo.position.set(BASE_C.x, 0.05, 0); P.halo.scale.set(hs, hs * 0.22, 1); P.halo.material.opacity = hi * (0.6 + 0.4 * pulse);
    const ai = lv < 1 ? 0 : 0.04 * lv; // the hull itself takes on the charge
    P.aura.position.set(BASE_C.x, BASE_C.y, 0); P.aura.scale.set(4.2, 4.2, 1); P.aura.material.opacity = ai * (0.7 + 0.3 * pulse);
    const si = lv < 5 ? 0 : 0.18 + (lv - 5) * 0.08; // LV6+
    const ss = 1 + Math.sin(P.t * 3) * 0.03;
    P.shield.position.set(BASE_C.x, BASE_C.y + 0.1, 0); P.shield.scale.set(5.6 * ss, 4.6 * ss, 1); P.shield.material.opacity = si * (0.6 + 0.4 * pulse);
    if (lv >= 2) { // LV3+: motes rising off the hull, more with each level
      P.mote -= dt;
      if (P.mote <= 0) {
        P.mote = 0.28 / (lv - 1);
        const m = sprite(tex.glow, lv >= max ? (Math.random() < 0.5 ? 0xffd04a : 0xfff2b0) : (Math.random() < 0.5 ? 0x48d8ff : 0xbff4ff));
        const x0 = BASE_C.x + (Math.random() - 0.5) * 3.2, y0 = 0.3 + Math.random() * 2.6, s0 = 0.2 + Math.random() * 0.25, sway = (Math.random() - 0.5) * 0.6;
        addFx(m, 1.4, (u) => { m.position.set(x0 + Math.sin(u * 6) * sway * 0.3, y0 + u * 1.6, 0); m.scale.set(s0, s0, 1); m.material.opacity = (u < 0.2 ? u * 5 : 1 - (u - 0.2) / 0.8) * 0.9; });
      }
    }
    if (lv >= 5) { // LV6+: arcs crawling over the hull
      P.arc -= dt;
      if (P.arc <= 0) {
        P.arc = 0.5 / (lv - 4);
        const x0 = BASE_C.x + (Math.random() - 0.5) * 2.6, y0 = 0.6 + Math.random() * 2.2;
        bolt(x0, y0, x0 + (Math.random() - 0.5) * 1.4, y0 + (Math.random() - 0.5) * 1.0, lv >= max ? 0xffe27a : 0xbff4ff);
      }
    }
  }

  // ── Orca cannon: a charge at the barrel, then a layered laser that sweeps the lane, then a fade ──
  // fired from the hull's front (the rig's ss_fire_3 point); the beam is tall enough to cover the ground and the
  // flyers' band, and it hits everything its head passes, in the air or on the ground
  const CAN = { x: 1.35, y: 1.45, charge: 0.35, sweep: 0.45, hold: 0.35, fade: 0.4 };
  function fireCannon() {
    if (!G || G.over || G.cannon < D.CANNON.charge || G.cannonFire) return;
    G.cannon = 0;
    G.cannonFire = { t: 0, hit: new Set(), fired: false, nextArc: 0 };
    AUDIO.play('charge', 0.8);
    // energy pulled into the barrel
    for (let i = 0; i < 14; i++) {
      const m = sprite(tex.glow, i % 3 ? 0x7fe8ff : 0xffffff);
      const ang = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 1.8, s0 = 0.22 + Math.random() * 0.28;
      addFx(m, CAN.charge, (u) => { const k = 1 - u * u; m.position.set(CAN.x + Math.cos(ang) * r * k, CAN.y + Math.sin(ang) * r * k * 0.7, 0); m.scale.set(s0, s0, 1); m.material.opacity = 0.3 + u * 0.7; });
    }
    const orb = sprite(tex.glow, 0xbff4ff);
    orb.position.set(CAN.x, CAN.y, 0);
    addFx(orb, CAN.charge + 0.05, (u) => { const s = 0.5 + u * 2.6 + Math.sin(u * 40) * 0.1; orb.scale.set(s, s, 1); orb.material.opacity = 0.4 + u * 0.6; });
    ring(CAN.x, CAN.y, 0x7fe8ff, 3.2, CAN.charge);
  }

  function cannonLayer(map, color, order) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
    m.renderOrder = order;
    G.root.add(m);
    return m;
  }
  function updateCannon(dt) {
    const c = G.cannonFire;
    if (!c) return;
    c.t += dt;
    const t = c.t - CAN.charge; // time since the shot left the barrel
    if (t < 0) return;
    const end = CAN.sweep + CAN.hold + CAN.fade;
    if (!c.fired) { // the shot: muzzle blast, recoil shake
      c.fired = true;
      sheet('burst', CAN.x + 0.3, CAN.y, 0xffffff, 3.2, 0.25); sheet('flash', CAN.x + 0.2, CAN.y, 0x9ff0ff, 2.6, 0.18);
      ring(CAN.x, CAN.y, 0xbff4ff, 5, 0.45);
      hitstop(0.06); shake(0.25, 0.6);
      AUDIO.play('beam'); AUDIO.play('laserBig');
      c.glow = cannonLayer(tex.beam, 0x2fb8ff, 1998);   // the wide halo
      c.body = cannonLayer(tex.energy, 0x4fc8ff, 1999); // the beam with streaming energy
      c.core = cannonLayer(tex.beam, 0xffffff, 2000);   // the white-hot core
      c.flare = cannonLayer(tex.glow, 0xdffbff, 2001);  // the travelling tip
      c.muzzle = cannonLayer(tex.glow, 0xbff4ff, 2001); // the barrel stays lit while it fires
      c.trail = cannonLayer(tex.beam, 0x38c8ff, 1997);  // the lane glows hot under the beam
    }
    const reachX = D.CANNON.reach;
    const head = CAN.x + Math.min(1, t / CAN.sweep) * reachX;
    const len = Math.max(0.01, head - CAN.x), cx = CAN.x + len / 2;
    const fade = t < CAN.sweep + CAN.hold ? 1 : Math.max(0, 1 - (t - CAN.sweep - CAN.hold) / CAN.fade);
    const thin = 0.25 + 0.75 * fade; // the beam narrows as it dies
    const fl = 1 + Math.sin(c.t * 60) * 0.06 + (Math.random() - 0.5) * 0.06;
    c.glow.scale.set(len + 0.8, 4.2 * thin * fl, 1); c.glow.position.set(cx, CAN.y, 0); c.glow.material.opacity = 0.2 * fade;
    c.body.scale.set(len, 2.5 * thin * fl, 1); c.body.position.set(cx, CAN.y, 0); c.body.material.opacity = 0.6 * fade;
    c.body.material.map.repeat.set(len / 4, 1); c.body.material.map.offset.x = -c.t * 4; // energy streams outward
    c.core.scale.set(len, 0.6 * thin * (1 + Math.sin(c.t * 90) * 0.15), 1); c.core.position.set(cx, CAN.y, 0); c.core.material.opacity = 0.85 * fade;
    const fs = (t < CAN.sweep ? 3.0 : 2.0) * thin * fl;
    c.flare.scale.set(fs * 1.4, fs, 1); c.flare.position.set(head, CAN.y, 0); c.flare.material.opacity = fade;
    c.trail.scale.set(len, 0.45, 1); c.trail.position.set(cx, 0.12, 0); c.trail.material.opacity = 0.45 * fade;
    const ms = 2.6 * thin * fl;
    c.muzzle.scale.set(ms, ms, 1); c.muzzle.position.set(CAN.x + 0.1, CAN.y, 0); c.muzzle.material.opacity = 0.9 * fade;
    // while the head travels: sparks thrown off it
    if (t < CAN.sweep) {
      if (Math.random() < 0.7) debris(head, CAN.y + (Math.random() - 0.5) * 1.6, 2, 0xbff4ff);
    }
    // electric arcs crawling along the beam
    if (fade > 0.3 && c.t >= c.nextArc) {
      c.nextArc = c.t + 0.06;
      const x0 = CAN.x + Math.random() * len * 0.9, x1 = Math.min(head, x0 + 0.6 + Math.random() * 1.2);
      bolt(x0, CAN.y + (Math.random() - 0.5) * 1.8, x1, CAN.y + (Math.random() - 0.5) * 1.8, 0xcff6ff);
    }
    const dmg = D.CANNON.dmg * Math.min(3, G.st.pow || 1); // grows with the campaign, not with hard / infinite
    for (const e of G.enemies) {
      if (e.dead || c.hit.has(e) || e.x > head) continue;
      c.hit.add(e);
      damage(e, dmg);
      text(e.x, e.dy + e.h + 0.2, fmtDmg(dmg), '#9ee8ff', 1.1);
      sheet('bolt', e.x, aimY(e) + e.h * 0.1, 0x9fe8ff, 1.8, 0.3);
      sheet('burst', e.x, aimY(e), 0xffffff, 1.6, 0.2);
      if (!e.dead) knockback(e, 1.6);
      sheet('blue', e.x, aimY(e), 0xbff4ff, 2.0, 0.4);
    }
    if (t > end) {
      for (const k of ['glow', 'body', 'core', 'flare', 'muzzle', 'trail']) { const m = c[k]; G.root.remove(m); m.material.dispose(); m.geometry.dispose(); }
      G.cannonFire = null;
    }
  }

  // ── effects ────────────────────────────────────────────
  function sprite(map, color, add = true) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, color, transparent: true, depthTest: false, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.renderOrder = 1500;
    G.root.add(m);
    return m;
  }
  const FX_MAX = 160; // oldest effects go first past this (dense fights on phones)
  function addFx(mesh, life, step) {
    if (G.fx.length >= FX_MAX) { const e = G.fx.shift(); G.root.remove(e.mesh); e.mesh.material.dispose(); e.mesh.geometry.dispose(); }
    G.fx.push({ mesh, life, t: 0, step });
  }
  // an original sprite-sheet effect played once over `life` seconds: frames step through the sheet's grid
  function sheet(key, x, y, color, size, life, o = {}) {
    const f = tex.fx[key];
    if (!f) return burst(x, y, color, size, life);
    // at most 4 large blasts at once: past that they play smaller so the fighters stay readable
    if (size > 2.2 && G.fx.reduce((n, e) => n + (e.big ? 1 : 0), 0) >= 4) size = Math.min(size, 1.6);
    const m = sprite(f.t, color);
    const uv = m.geometry.attributes.uv;
    const n = f.cols * f.rows;
    const aspect = o.aspect || 1;
    m.position.set(x, y, 0);
    m.rotation.z = o.rot || 0;
    let last = -1;
    addFx(m, life, (u) => {
      const k = Math.min(n - 1, Math.floor(u * n));
      if (k !== last) {
        last = k;
        const cx = k % f.cols, cy = Math.floor(k / f.cols);
        const u0 = cx / f.cols, u1 = (cx + 1) / f.cols, v1 = 1 - cy / f.rows, v0 = 1 - (cy + 1) / f.rows;
        uv.setXY(0, o.flip ? u1 : u0, v1); uv.setXY(1, o.flip ? u0 : u1, v1); uv.setXY(2, o.flip ? u1 : u0, v0); uv.setXY(3, o.flip ? u0 : u1, v0);
        uv.needsUpdate = true;
      }
      const s = size * (o.grow ? 0.7 + u * o.grow : 1);
      m.scale.set(s * aspect, s, 1);
      m.material.opacity = (u < 0.75 ? 1 : (1 - u) * 4) * (size > 2.2 ? 0.7 : 1); // big blasts don't white out the lane
    });
    if (size > 2.2) G.fx[G.fx.length - 1].big = true;
  }
  // sparks thrown out of a wreck: small glows on short ballistic arcs
  function debris(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const m = sprite(tex.glow, color);
      const vx = (Math.random() - 0.5) * 5, vy = 2 + Math.random() * 3, s0 = 0.15 + Math.random() * 0.2;
      addFx(m, 0.5 + Math.random() * 0.3, (u) => {
        const t = u * 0.6;
        m.position.set(x + vx * t, y + vy * t - 9 * t * t, 0);
        m.scale.set(s0, s0, 1);
        m.material.opacity = 1 - u;
      });
    }
  }
  function shake(power, time) { if (G) { G.shake = Math.max(G.shake || 0, time); G.shakeP = Math.max(G.shakeP || 0, power); } }
  function burst(x, y, color, size, life) {
    const m = sprite(tex.glow, color);
    m.position.set(x, y, 0);
    addFx(m, life, (u) => { const s = size * (0.4 + u * 0.8); m.scale.set(s, s, 1); m.material.opacity = 1 - u; });
  }
  // an ordered skill marks its strike zone on the ground (the unit's whole reach) until the hit lands
  function telegraph(f, life) {
    const len = Math.max(1, f.def.range), cx = f.x + f.dir * len / 2, T = Math.max(0.9, life + 0.4);
    const band = sprite(tex.beam, 0xffd200); // the zone: a soft band on the ground, under 40% so the units stay visible
    band.position.set(cx, f.dy - 0.05, 0);
    addFx(band, T, (u) => { band.scale.set(len * (0.3 + 0.7 * Math.min(1, u * 4)), 0.75, 1); band.material.opacity = 0.38 * (u < 0.8 ? 1 : (1 - u) * 5); });
    for (const k of [0, 1]) { // bright edges at both ends of the zone
      const e = sprite(tex.beam, 0xffe680);
      e.position.set(f.x + f.dir * len * k, f.dy - 0.05, 0);
      e.rotation.z = Math.PI / 2;
      addFx(e, T, (u) => { e.scale.set(0.9, 0.12, 1); e.material.opacity = 0.75 * (u < 0.8 ? 1 : (1 - u) * 5); });
    }
    const end = sprite(tex.ring, 0xffd200);
    end.position.set(f.x + f.dir * len, f.dy, 0);
    addFx(end, T, (u) => { const k = 2.4 * (1 - u) + 0.5; end.scale.set(k, k * 0.45, 1); end.material.opacity = 0.35 + u * 0.4; });
  }
  function ring(x, y, color, size, life) {
    const m = sprite(tex.ring, color);
    m.position.set(x, y, 0);
    addFx(m, life, (u) => { const s = size * (0.15 + u * 0.85); m.scale.set(s, s * 0.45, 1); m.material.opacity = 1 - u; });
  }
  // a sound-wave front: the ring texture stood upright (a tall ellipse), growing and fading as it travels
  function arc(x, y, color, size, life, delay = 0, rot = 0) {
    const m = sprite(tex.ring, color);
    m.position.set(x, y, 0);
    m.rotation.z = rot; // across the shot
    m.visible = delay <= 0;
    addFx(m, life + delay, (u) => {
      const t = (u * (life + delay) - delay) / life;
      m.visible = t >= 0;
      if (t < 0) return;
      const s = size * (0.35 + t * 0.65);
      m.scale.set(s * 0.42, s, 1); m.material.opacity = 0.9 * (1 - t);
    });
  }
  function streak(x0, y0, x1, y1, color, width, life) {
    const m = sprite(tex.beam, color);
    const len = Math.hypot(x1 - x0, y1 - y0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    addFx(m, life, (u) => { m.scale.set(len, width * (1 - u * 0.6), 1); m.material.opacity = 1 - u; });
  }
  // a visible shot for effects that only had an impact: a glowing round from the weapon to the target
  // (arc > 0 lobs it like a shell); the impact plays when it lands
  function shot(x0, y0, x1, y1, color, life, arc, size, land) {
    const m = sprite(tex.glow, color);
    let landed = false;
    addFx(m, life, (u) => {
      const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u + arc * 4 * u * (1 - u);
      m.position.set(x, y, 0);
      m.scale.set(size, size, 1);
      m.material.opacity = 1;
      if (u > 0.08 && Math.random() < 0.3) sheet('smoke', x, y, color, size * 1.1, 0.22, { grow: 0.4 }); // a short trail
      if (u >= 1 && !landed) { landed = true; land(); }
    });
  }
  function tracer(x0, y0, x1, y1, color) {
    const m = sprite(tex.beam, color);
    m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    addFx(m, 0.12, (u) => {
      m.position.set(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0);
      m.scale.set(0.7, 0.09, 1);
      m.material.opacity = 1 - u * 0.4;
    });
  }

  // a jagged lightning line
  function bolt(x0, y0, x1, y1, color) {
    let px = x0, py = y0;
    for (let i = 1; i <= 4; i++) {
      const u = i / 4, nx = x0 + (x1 - x0) * u, ny = y0 + (y1 - y0) * u + (i < 4 ? (Math.random() - 0.5) * 0.6 : 0);
      streak(px, py, nx, ny, color, 0.16, 0.2);
      px = nx; py = ny;
    }
  }

  // hits: the original effect sheets, tinted by the attacker's colour
  // ── original effects (baked from the Unity prefabs: tools/build_fx.py, js/fxbake.js) ──
  let ORIG_MAX = 110; // concurrent baked effects; past this the light sheet effects are used
  const origCache = {};
  // unit id + clip -> { bullet, hit, statics } from the clip's animation events (FX_META.uses)
  function origFor(id, clip) {
    const key = id + ':' + clip;
    if (key in origCache) return origCache[key];
    let o = null;
    const M = window.FX_META;
    if (M) {
      const pick = (kind) => Object.entries(M.uses).filter(([, us]) => us.some(([uid, c, fn]) => uid === id && c === clip && fn.startsWith(kind))).map(([n]) => n);
      const bullets = pick('EventThrowProjectile'), statics = pick('EventThrowEffect');
      if (bullets.length || statics.length) {
        const b = bullets.find((n) => M.meta[n] && M.meta[n].type >= 0) || null;
        o = { bullet: b, hit: b ? M.meta[b].hit : '', statics };
      }
    }
    if (!o && clip === 'skill') o = origFor(id, 'atk');
    origCache[key] = o;
    return o;
  }
  const fxRoom = () => G.bfx.length + G.sfx.length < ORIG_MAX;
  function spawnStatic(name, x, y, k) {
    if (!fxRoom() || !FXB.ready(name)) return false;
    const inst = FXB.create(name);
    if (!inst) return false;
    inst.root.position.set(x, y, 0);
    inst.root.scale.set(k, k, 1);
    inst.setOrder(1400);
    G.root.add(inst.root);
    G.sfx.push(inst);
    return true;
  }
  // ── muzzles: where the original fires from (ported from 5_LAO_Defence) ──
  // EventThrowProjectileFire<n> leaves from the character script's _fire<n> transform (tools/build_events.py:
  // ANIM_EV[id].fire[n] = the chain from that point up to the model root). The point is usually pruned from the
  // rig, so it rides on its nearest kept ancestor bone with the fixed offset of the pruned levels and follows the
  // animated bone every frame.
  const _mv = new THREE.Vector3(), _mq = new THREE.Quaternion(), _ms = new THREE.Vector3();
  function fireAnchor(t, ch) {
    const N = t.data.nodes;
    const chainOk = (i, k) => { for (let j = k; j < ch.length && i >= 0; j++, i = N[i].p) if (N[i].n !== ch[j][0]) return false; return true; };
    for (let k = 0; k < ch.length; k++) {
      const cand = [];
      N.forEach((nd, i) => { if (nd.n === ch[k][0] && chainOk(i, k)) cand.push(i); });
      if (!cand.length) continue;
      const p = new THREE.Vector3();
      for (let j = 0; j < k; j++) { // Unity space, fire point -> anchor
        const [, T, Q, S] = ch[j];
        p.multiply(_ms.set(S[0], S[1], S[2])).applyQuaternion(_mq.set(Q[0], Q[1], Q[2], Q[3])).add(_mv.set(T[0], T[1], T[2]));
      }
      return { cand, p: [p.x, p.y, -p.z] }; // the rig mirrors z
    }
    return null;
  }
  function muzzleAt(f, ix, px, py, pz) {
    const W = f.sd.W, i = ix * 12;
    _mv.set(W[i] * px + W[i + 3] * py + W[i + 6] * pz + W[i + 9],
      W[i + 1] * px + W[i + 4] * py + W[i + 7] * pz + W[i + 10],
      W[i + 2] * px + W[i + 5] * py + W[i + 8] * pz + W[i + 11]);
    f.sd.mesh.localToWorld(_mv); // the body mesh, which carries the attack clips' root-motion pin offset
    return G.root.worldToLocal(_mv);
  }
  const WEAPON = /gun|rifle|revolver|pistol|cannon|launcher|bazooka|weapon|barrel/i;
  // a point authored on the static root marks the gun only in the original's choreography: fire from the tip of
  // the visible weapon sprite nearest to it (its forward-most vertex)
  function weaponTip(f, ix, p) {
    const sd = f.sd, t = sd.tpl, N = t.data.nodes, W = sd.W;
    const ws = t.weapons || (t.weapons = t.rends.map((r, k) => (r.kind === 0 && WEAPON.test(N[r.node].n) ? k : -1)).filter((k) => k >= 0));
    if (!ws.length) return null;
    const i0 = ix * 12;
    const ax = W[i0] * p[0] + W[i0 + 3] * p[1] + W[i0 + 9], ay = W[i0 + 1] * p[0] + W[i0 + 4] * p[1] + W[i0 + 10];
    let best = null, bd = Infinity;
    for (const k of ws) {
      const r = t.rends[k];
      if (!sd.EA[r.node] || !sd.rEn[k] || sd.rCol[k * 4 + 3] < 0.1) continue;
      const sp = t.sprites[sd.rKey[k]];
      if (!sp || !sp.gv) continue;
      const i = r.node * 12, g = sp.gv;
      let tx = 0, ty = 0, mx = -Infinity;
      for (let j = 0; j < g.length; j += 2) {
        const x = W[i] * g[j] + W[i + 3] * g[j + 1] + W[i + 9], y = W[i + 1] * g[j] + W[i + 4] * g[j + 1] + W[i + 10];
        if (x > mx) { mx = x; tx = x; ty = y; }
      }
      const d = (tx - ax) ** 2 + (ty - ay) ** 2;
      if (d < bd) { bd = d; best = [tx, ty]; }
    }
    if (!best) return null;
    _mv.set(best[0], best[1], 0);
    sd.mesh.localToWorld(_mv);
    G.root.worldToLocal(_mv);
    return [_mv.x, _mv.y];
  }
  // fire point n (0: a contact hit) of fighter f, in field coordinates; in front of the chest when the rig has none
  function muzzle(f, n) {
    const front = [f.x + f.dir * (f.h * 0.35 + dashOf(f)), f.dy + (f.hop || 0) + flyY(f) + f.h * 0.55]; // flyers fire from up where they hover
    const all = window.ANIM_EV && ANIM_EV[f.def.id];
    const ch = n > 0 && f.ally && all && all.fire && (all.fire[n] || all.fire[1]);
    if (!ch || !f.sd || !f.sd.W) return front;
    const t = f.sd.tpl, fire = t.fire || (t.fire = {});
    const key = all.fire[n] ? n : 1;
    if (!(key in fire)) fire[key] = fireAnchor(t, ch);
    const fp = fire[key];
    if (!fp) return front;
    const ea = f.sd.EA, ix = fp.cand.find((c) => !ea || ea[c]) ?? fp.cand[0]; // the copy on screen
    placeHolder(f);
    f.holder.updateMatrixWorld(true);
    if (t.data.nodes[ix].p < 0 || /^(size_root|model_|fx$)/i.test(t.data.nodes[ix].n)) {
      const tip = weaponTip(f, ix, fp.p);
      if (tip) return tip;
    }
    const behind = (v) => (v.x - f.x) * f.dir < -0.2 * f.h;
    let v = muzzleAt(f, ix, fp.p[0], fp.p[1], fp.p[2]);
    if (behind(v)) v = muzzleAt(f, ix, -fp.p[0], fp.p[1], fp.p[2]); // a point on the far side of a mirrored bone
    return behind(v) ? front : [v.x, v.y];
  }

  // fire the unit's original projectile at (tx, ty) (its hit effect plays on arrival), or play its thrown effect there
  function origShot(f, o, tx, ty, mz) {
    const k = ALLY_K;
    if (o.bullet && FXB.ready(o.bullet) && fxRoom()) {
      const meta = FX_META.meta[o.bullet];
      const inst = FXB.create(o.bullet);
      inst.root.scale.set(k, k, 1);
      inst.setOrder(1400);
      G.root.add(inst.root);
      const [sx, sy] = mz || muzzle(f, 1);
      G.bfx.push({ inst, t: 0, T: Math.max(0.08, meta.T), type: meta.type, sx, sy, ex: tx, ey: ty, hit: meta.hit, hs: meta.hitScale || 1, k, h: 0.1 + Math.random() * 0.3 });
      return true;
    }
    if (o.statics.length) return spawnStatic(o.statics[0], tx, ty, k);
    return false;
  }
  // Projectile.cs trajectories: LINE / CURVE / HOWITZER / CANNON as Bezier curves along the shot
  function origPath(b, u) {
    const sx = b.sx, sy = b.sy, ex = b.ex, ey = b.ey;
    if (b.type <= 0) return [sx + (ex - sx) * u, sy + (ey - sy) * u, ex - sx, ey - sy];
    const dist = Math.hypot(ex - sx, ey - sy) || 1, fx = (ex - sx) / dist, fy = (ey - sy) / dist;
    let nx = -fy, ny = fx;
    if (ny < 0) { nx = -nx; ny = -ny; }
    let a1, h1, a2, h2;
    if (b.type === 1) { a1 = a2 = 0.5; h1 = h2 = b.h; } else { const r = b.type === 2 ? 0.5 : 0.3; a1 = r * 0.7; h1 = h2 = r * 0.7; a2 = b.type === 2 ? a1 : 1 - a1; }
    const c1x = sx + (fx * a1 + nx * h1) * dist, c1y = sy + (fy * a1 + ny * h1) * dist;
    const c2x = sx + (fx * a2 + nx * h2) * dist, c2y = sy + (fy * a2 + ny * h2) * dist;
    const m = 1 - u;
    return [m * m * m * sx + 3 * m * m * u * c1x + 3 * m * u * u * c2x + u * u * u * ex,
      m * m * m * sy + 3 * m * m * u * c1y + 3 * m * u * u * c2y + u * u * u * ey,
      3 * m * m * (c1x - sx) + 6 * m * u * (c2x - c1x) + 3 * u * u * (ex - c2x),
      3 * m * m * (c1y - sy) + 6 * m * u * (c2y - c1y) + 3 * u * u * (ey - c2y)];
  }
  function updateOrig(dt) {
    for (let i = G.bfx.length - 1; i >= 0; i--) {
      const b = G.bfx[i];
      b.t += dt;
      const u = Math.min(1, b.t / b.T);
      const [x, y, dx, dy] = origPath(b, u);
      b.inst.root.position.set(x, y, 0);
      b.inst.root.rotation.z = Math.atan2(dy, dx);
      b.inst.update(dt);
      if (u >= 1) {
        if (!(b.hit && spawnStatic(b.hit, b.ex, b.ey, b.k * b.hs))) sheet('hit', b.ex, b.ey, 0xffffff, 1.0, 0.22);
        b.inst.dispose();
        G.bfx.splice(i, 1);
      }
    }
    for (let i = G.sfx.length - 1; i >= 0; i--) {
      G.sfx[i].update(dt);
      if (G.sfx[i].done) { G.sfx[i].dispose(); G.sfx.splice(i, 1); }
    }
  }

  // an ordered skill: the HUD shows its cut-in, the battle holds its breath
  // SS: every skill gets the full cut-in (one of each on the field, so it never stacks; two different SS firing
  // together wait 1.2 s for the screen). S: a short hitstop and the SKILL callout only.
  function cutIn(f) {
    if (f.def.rank !== 'SS') { hitstop(0.06); return; }
    if (G.t - (G.lastCut || -99) < 1.2) { hitstop(0.08); return; }
    G.lastCut = G.t;
    hitstop(0.25);
    shake(0.2, 0.3);
    if (G.hooks.onSkill) G.hooks.onSkill(f.def);
  }
  // the commander orders the frontmost charged unit of deck slot i to use its skill
  function orderSkill(i) {
    if (!G || G.over || G.paused) return false;
    const slot = G.deck[i];
    if (!slot) return false;
    const ready = G.allies.filter((a) => !a.dead && a.def.id === slot.def.id && a.manual && a.charge >= a.skillCharge && !a.order);
    if (!ready.length) return false;
    ready.sort((a, b) => b.x - a.x)[0].order = true;
    return true;
  }
  // per deck slot: 0 none deployed, 1 charging (fraction), 2 ready
  function skillState(i) {
    const slot = G && G.deck[i];
    if (!slot || !SKILL[slot.def.rank]) return null;
    let best = -1;
    for (const a of G.allies) if (!a.dead && a.def.id === slot.def.id) best = Math.max(best, a.order ? 0 : a.charge / a.skillCharge);
    return best;
  }

  function hitFx(f, tx, ty, mz) {
    const c = f.def.color || 0xff8855;
    const [mx, my] = mz || muzzle(f, 1);
    const jx = tx + (Math.random() - 0.5) * 0.3, jy = ty + (Math.random() - 0.5) * 0.4;
    if (!f.ally) {
      if (f.def.area) { sheet('smoke', jx, jy, 0xff8a5a, 1.4, 0.4, { grow: 0.5 }); sheet('burst', jx, jy, c, 0.9, 0.18); }
      else sheet('hit', jx, jy, 0xffb08a, 1.1, 0.24);
      return;
    }
    switch (f.def.fx) {
      case 'bullet': sheet('flash', mx, my, c, 0.5, 0.08); tracer(mx, my, tx, ty, c); sheet('hit', jx, jy, c, 1.0, 0.22); break;
      case 'snipe': sheet('flash', mx, my, c, 0.7, 0.1); streak(mx, my, tx, ty, c, 0.12, 0.18); sheet('burst', jx, jy, c, 1.2, 0.2); sheet('hit', jx, jy, 0xffffff, 1.3, 0.26); break;
      case 'grenade': case 'missile': case 'fireball': { // launch flash, the round in flight (grenades lob), then the blast
        const d = Math.abs(tx - mx), lob = f.def.fx === 'grenade' ? 0.8 + d * 0.22 : f.def.fx === 'missile' ? 0.3 + d * 0.06 : 0;
        sheet('flash', mx, my, c, 0.8, 0.1);
        shot(mx, my, jx, jy, c, f.def.fx === 'grenade' ? 0.42 : 0.24, lob, f.def.fx === 'fireball' ? 0.75 : 0.5,
          () => { sheet('burst', jx, jy, c, 2.0, 0.18); sheet('smoke', jx, jy + 0.2, c, 2.2, 0.5, { grow: 0.5 }); ring(tx, 0.1, c, 2.4, 0.35); });
        break;
      }
      case 'flame': for (let i = 0; i < 2; i++) sheet('smoke', mx + f.dir * (0.4 + Math.random() * Math.abs(tx - mx)), my + (Math.random() - 0.5) * 0.4, c, 1.1, 0.35, { grow: 0.6 }); break;
      case 'wave': // sonic: a soft beam from the weapon, wave fronts rolling out along it, a burst on the target
        streak(mx, my, tx, ty, c, 0.5, 0.26);
        const ang = Math.atan2(ty - my, tx - mx);
        for (let k = 0; k < 3; k++) { const u = 0.2 + k * 0.3; arc(mx + (tx - mx) * u, my + (ty - my) * u, c, 0.9 + u * 0.8, 0.28, k * 0.05, ang); }
        ring(tx, ty, c, 1.9, 0.4); sheet('hit', jx, jy, c, 1.4, 0.3); break;
      case 'frost': // an icy streak from the weapon, then the frost burst
        sheet('flash', mx, my, 0xcff6ff, 0.7, 0.1); streak(mx, my, jx, jy, c, 0.18, 0.2);
        shot(mx, my, jx, jy, 0xcff6ff, 0.2, 0, 0.45, () => { sheet('blue', jx, jy, 0xcff6ff, 1.6, 0.4); ring(tx, 0.1, c, 1.8, 0.45); });
        break;
      case 'laser': streak(mx, my, tx + f.dir * 0.4, ty, c, 0.32, 0.22); sheet('burst', jx, jy, c, 1.3, 0.2); sheet('blue', jx, jy, c, 1.4, 0.3); break;
      case 'slash': sheet('slash', jx, jy, c, 1.5, 0.22, { aspect: 2, flip: f.dir < 0, rot: (Math.random() - 0.5) * 0.6 }); sheet('hit', jx, jy, 0xffffff, 1.2, 0.22); break;
      case 'lightning': bolt(mx, my, tx, ty, c); sheet('bolt', jx, jy + 0.6, c, 1.8, 0.3); sheet('spark', jx, jy, c, 1.0, 0.3); break;
      case 'holy': // a mote of light from the weapon, then the holy burst
        sheet('flash', mx, my, c, 0.8, 0.1);
        shot(mx, my, jx, jy, c, 0.22, 0.15, 0.6, () => { sheet('aura', jx, ty + 0.6, c, 2.2, 0.45); sheet('burst', jx, jy, c, 1.4, 0.2); });
        break;
      default: sheet('hit', jx, jy, c, 1.0, 0.22);
    }
  }

  function updateFx(dt) {
    updateOrig(dt);
    if (window.SDPS) SDPS.tick(dt);
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const e = G.fx[i];
      e.t += dt;
      const u = Math.min(1, e.t / e.life);
      e.step(u);
      if (u >= 1) { G.root.remove(e.mesh); e.mesh.material.dispose(); e.mesh.geometry.dispose(); G.fx.splice(i, 1); }
    }
    for (let i = G.texts.length - 1; i >= 0; i--) { G.texts[i].t += dt; if (G.texts[i].t > 1.1) G.texts.splice(i, 1); }
  }

  function text(x, y, s, color, size = 1) { G.texts.push({ x, y, s, color, t: 0, size }); }
  const fmtDmg = (v) => (v >= 10000 ? (v / 1000).toFixed(1) + 'K' : Math.round(v).toLocaleString());
  // hitstop: the battle freezes for a beat on heavy hits (real time)
  function hitstop(sec) { if (G) G.stop = Math.max(G.stop || 0, sec); }

  let toastT = 0;
  function toast(msg, warn, ms = 1800) {
    if (G && G.cine > 0) { G.heldToast = [msg, warn, ms]; return; } // the boss reveal owns the screen: shown once it ends
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (warn ? ' warn' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.className = 'toast'; }, ms);
  }

  let pan = null;
  function panTo(x) { pan = { to: x, battle: G }; }

  // ── frame ──────────────────────────────────────────────
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    if (G) {
      if (pan && pan.battle !== G) pan = null;
      if (G.cine > 0 && !G.paused) { G.cine -= rdt; if (G.cine <= 0) { document.body.classList.remove('cine'); if (!G.userCam) pan = null; if (G.heldToast) { toast(...G.heldToast); G.heldToast = null; } } }
      const sdt = G.paused ? 0 : rdt * G.speed * (G.cine > 0 ? 0.3 : 1);
      G.acc = Math.min(STEP * 10, (G.acc || 0) + sdt); // a slow device drops time instead of running behind forever
      let n = 0;
      if (G.stop > 0) { G.stop -= rdt; G.acc = 0; }
      while (G && G.acc >= STEP && n < 10) { update(STEP); G && (G.acc -= STEP); n++; }
      if (!G) return;
      if (G.userCam && now - G.userCam > 5000) G.userCam = false;
      if (!pan && !G.userCam && !G.over) {
        let front = 0;
        for (const a of G.allies) if (!a.dead) front = Math.max(front, a.x);
        const want = front + VW * 0.15;
        camX += (want - camX) * Math.min(1, rdt * 1.5);
        clampCam(); updateCam();
      }
      if (pan) {
        camX += (pan.to - camX) * Math.min(1, rdt * 3);
        if (Math.abs(pan.to - camX) < 0.05 && !(G.cine > 0)) pan = null; // the reveal holds on the boss
        clampCam(); updateCam();
      }
      if (G.shake > 0) { G.shake -= rdt; if (G.shake <= 0) G.shakeP = 0; updateCam(); }
      syncVisuals(sdt);
      if (G.hooks.onFrame) G.hooks.onFrame(G);
    }
    renderer.render(scene, camera);
    drawOverlay();
  }

  // the fighter's drawn position (also used before solving a muzzle, so a shot leaves from where the unit is now)
  // how far along its dash a unit is drawn (0 at home, 1 at the target), from the original's move timings
  function dashOf(f) {
    const a = f.act, m = a && f.state === 'atk' && a.mv;
    if (!m) return 0;
    const [s0, s1, s2, s3] = m.at, t = a.t, ease = (u) => u * u * (3 - 2 * u);
    let k = 0;
    if (t >= s0 && t < s1) k = ease((t - s0) / Math.max(1e-3, s1 - s0));
    else if (t >= s1 && t < s2) k = 1;
    else if (t >= s2 && t < s3) k = 1 - ease((t - s2) / Math.max(1e-3, s3 - s2));
    return k * m.dist;
  }
  function placeHolder(f) {
    const lift = f.def.fly ? flyY(f) + Math.sin(G.t * 3 + f.dy * 9) * 0.08 : 0; // flyers hover above the lane
    f.holder.position.set(f.x + (f.cx || 0) + f.dir * dashOf(f), f.dy + (f.hop || 0) + lift, 0);
    return lift;
  }
  // drawing only (the simulation keeps its x): units piled on one spot are shown in ranks stepping back from the front,
  // so a dense group reads as a formation instead of one blob
  function crowd(list) {
    for (const air of [false, true]) { // the ground fight and the flyers above it are laid out separately
      const g = list.filter((f) => !f.dead && !!f.def.fly === air).sort((a, b) => (b.x - a.x) * b.dir);
      for (let i = 0; i < g.length; i++) {
        const f = g[i];
        let k = 0;
        for (let j = i - 1; j >= 0 && Math.abs(g[j].x - f.x) < 0.35; j--) k++;
        const want = -f.dir * Math.min(k, 8) * (air ? 0.3 : 0.17);
        f.cx = (f.cx || 0) + (want - (f.cx || 0)) * 0.12;
        if (air) f.cy = (f.cy || 0) + ((k % 2) * 0.5 - (f.cy || 0)) * 0.12; // stacked flyers alternate in height
      }
    }
  }
  // phones in crowded fights: each rig is evaluated every other frame (its time still advances in full)
  let LOD_AT = 60, lodFrame = 0;
  function syncVisuals(dt) {
    const all = [...G.allies, ...G.enemies];
    const lod = all.length > LOD_AT;
    lodFrame++;
    crowd(G.allies); crowd(G.enemies);
    for (let i = 0; i < all.length; i++) {
      const f = all[i];
      const lift = placeHolder(f);
      const sq = f.flashT > 0 ? f.flashT / 0.08 : 0; // a quick squash on every hit
      f.holder.scale.set(1 + 0.08 * sq, 1 - 0.08 * sq, 1);
      f.shadow.position.y = -(f.hop || 0) - lift;
      if (f.sd) {
        const fl = f.flashT > 0 ? 1.9 : 1;
        if (f.slowT > 0 && !f.dead) f.sd.setTint(0.65 * fl, 0.85 * fl, 1.25 * fl);
        else if (!(f.boss && f.state === 'fade')) f.sd.setTint(fl, fl, fl); // a falling boss keeps its burn
        f.sdAcc = (f.sdAcc || 0) + dt;
        if (!lod || ((lodFrame + i) & 1)) { f.sd.update(f.sdAcc); f.sdAcc = 0; }
      }
    }
    if (G.baseRig) {
      const fl = G.ebase.flash ? 1.7 : 0.85;
      G.baseRig.setTint(fl, fl * 0.85, fl * 0.85);
      G.baseRig.update(dt);
      if (G.over === 'win') G.baseRig.setOpacity(Math.max(0, 1 - G.overT / 1.6));
    }
    if (!G.readyGlow) { G.readyGlow = sprite(tex.glow, 0x5ad1ff); G.readyGlow.renderOrder = 30; }
    const ready = G.cannon >= D.CANNON.charge && !G.over;
    G.readyGlow.visible = ready;
    if (ready) { const p = 2.6 + Math.sin(G.t * 6) * 0.4; G.readyGlow.scale.set(p, p, 1); G.readyGlow.position.set(-0.8, 2.2, 0); G.readyGlow.material.opacity = 0.55; }
    if (G.ourRig) {
      const fl = G.base.flash ? 1.8 : 1, lv = G.worker, max = D.WORKER.cost.length;
      const up = lv >= 5 ? 0.06 * (lv - 4) : 0; // LV6+: the hull itself glows a little (gold at the last level)
      G.ourRig.setTint(fl * (1 + up), fl * (1 + up), fl * (1 + up * (lv >= max ? 0.2 : 1.8)));
      G.ourRig.update(dt);
      if (G.over === 'lose') G.ourRig.setOpacity(Math.max(0, 1 - G.overT / 1.6));
    }
    if (G.baseMesh) {
      G.baseMesh.material.color.setScalar(G.base.flash ? 1.8 : 1);
      if (G.over === 'lose') G.baseMesh.material.opacity = Math.max(0, 1 - G.overT / 1.6);
    }
  }

  function drawOverlay() {
    const g = octx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    if (!G) return;
    // base HP
    const bar = (x, y, hp, max, color, label) => {
      let [sx, sy] = toScreen(x, y);
      if (sx < -120 || sx > innerWidth + 120) return;
      sx = Math.max(60, Math.min(innerWidth - 60, sx)); // the camera clamp can leave a base at the very edge: keep its label readable
      sy = Math.max(sy, hudTop + 30); // short screens: the label stays under the top bar (stage name / buttons)
      g.textAlign = 'center';
      g.font = "700 15px Exo2, Godo, sans-serif";
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.85)';
      const s = Math.ceil(hp) + ' / ' + max;
      g.strokeText(s, sx, sy); g.fillStyle = '#fff'; g.fillText(s, sx, sy);
      g.font = "700 11px Godo, sans-serif"; g.strokeText(label, sx, sy - 17); g.fillStyle = color; g.fillText(label, sx, sy - 17);
      const w = 110;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(sx - w / 2, sy + 5, w, 7);
      g.fillStyle = color; g.fillRect(sx - w / 2, sy + 5, w * Math.max(0, hp / max), 7);
    };
    bar(-0.7, 4.25, G.base.hp, G.base.max, '#48d8ff', '오르카 전진기지');
    if (!(G.over && G.st.finale)) bar(G.len + 0.9, 4.45, G.ebase.hp, G.ebase.max, '#ff5566', '철충 요새'); // the finale shows the fall, not a counter
    // HP slivers over hurt fighters
    for (const list of [G.allies, G.enemies]) for (const f of list) {
      if (f.dead || f.hp >= f.maxHp || f.boss) continue;
      const [sx, sy] = toScreen(f.x, f.dy + f.h * UNIT_SCALE + (f.def.fly ? flyY(f) + 0.1 : 0.1));
      if (sx < -20 || sx > innerWidth + 20) continue;
      const w = 26;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(sx - w / 2 - 1, sy - 1, w + 2, 5);
      g.fillStyle = f.ally ? '#5fd2ff' : '#ff5a4a'; g.fillRect(sx - w / 2, sy, w * Math.max(0, f.hp / f.maxHp), 3);
      if (f.shield > 0) { g.fillStyle = '#c9b8ff'; g.fillRect(sx - w / 2, sy - 3, w * Math.min(1, f.shield / (f.maxHp * (f.def.shield || 1))), 2); }
    }
    // floating texts
    g.font = "900 italic 17px Exo2, sans-serif"; g.textAlign = 'center'; g.lineWidth = 4;
    for (const t of G.texts) {
      let [sx, sy] = toScreen(t.x, t.y + t.t * 0.8);
      sx = Math.max(44, Math.min(innerWidth - 44, sx)); // callouts stay on screen
      const pop = t.size > 1 ? 1 + Math.max(0, 0.15 - t.t) * 4 : 1; // big texts pop in
      g.font = `900 italic ${Math.round(17 * (t.size || 1) * pop)}px Exo2, Godo, sans-serif`;
      g.globalAlpha = Math.max(0, 1 - t.t / 1.1);
      g.strokeStyle = '#000'; g.strokeText(t.s, sx, sy); g.fillStyle = t.color; g.fillText(t.s, sx, sy);
    }
    g.globalAlpha = 1;
    // boss bar
    if (G.boss && !G.boss.dead) {
      const w = Math.min(420, innerWidth * 0.6), x = (innerWidth - w) / 2, y = 62;
      g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - 2, y - 2, w + 4, 14);
      g.fillStyle = '#ff3355'; g.fillRect(x, y, w * (G.boss.hp / G.boss.maxHp), 10);
      g.font = "700 13px Godo, sans-serif"; g.textAlign = 'center'; g.fillStyle = '#fff';
      g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText('BOSS ' + G.boss.def.name, innerWidth / 2, y - 6); g.fillText('BOSS ' + G.boss.def.name, innerWidth / 2, y - 6);
    }
    // minimap: the whole lane, the camera window and every fighter
    const mw = Math.min(360, innerWidth * 0.5), mx = (innerWidth - mw) / 2, my = G.boss && !G.boss.dead ? 84 : 52, mh = 10;
    const span = G.len + 4, wx = (x) => mx + ((x + 2) / span) * mw;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(mx, my, mw, mh);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5;
    g.strokeRect(wx(camera.left), my - 1, wx(camera.right) - wx(camera.left), mh + 2);
    g.fillStyle = '#48d8ff'; g.fillRect(wx(-0.7) - 3, my, 6, mh);
    g.fillStyle = '#ff5566'; g.fillRect(wx(G.len + 0.9) - 3, my, 6, mh);
    for (const f of G.allies) if (!f.dead) { g.fillStyle = '#9fe8ff'; g.fillRect(wx(f.x) - 1, my + 2, 2, mh - 4); }
    for (const f of G.enemies) if (!f.dead) { g.fillStyle = f.boss ? '#ffcc00' : '#ff8899'; g.fillRect(wx(f.x) - (f.boss ? 2 : 1), my + 2, f.boss ? 4 : 2, mh - 4); }
    G.mini = { x: mx, y: my, w: mw, h: mh, span };
  }

  // tap on the minimap jumps the camera
  addEventListener('pointerdown', (e) => {
    if (!G || !G.mini) return;
    const m = G.mini;
    if (e.clientY < m.y - 8 || e.clientY > m.y + m.h + 8 || e.clientX < m.x || e.clientX > m.x + m.w) return;
    pan = null; camX = (e.clientX - m.x) / m.w * m.span - 2; clampCam(); updateCam(); G.userCam = performance.now();
  });

  window.GAME = {
    cameraState: () => ({ x: camX, zoom, panning: !!pan, left: camera.left, right: camera.right }),
    zoom: (z, sx) => (z == null ? zoom : setZoom(z, sx)),
    setHudInset(f, top) { hudTop = top || 0; if (Math.abs(f - hudFrac) > 0.005) { hudFrac = f; resize(); } },
    init, preload, start, stop, deploy, upgradeWorker, fireCannon, toast,
    get state() { return G; },
    setSpeed(s) { if (G && !(G.over && G.st.finale)) G.speed = s; },
    setPaused(p) { if (G) G.paused = p; },
    wallet: () => (G ? wallet() : 0),
    orderSkill, skillState, onField: (def) => !!G && onField(def),
    TIME_LIMIT: 600,
    // tests: every effect sheet in a row at the camera's centre, frozen at frame `u` (0..1)
    fxTest(u = 0.3) {
      if (!G) return;
      const keys = Object.keys(tex.fx);
      keys.forEach((k, i) => {
        sheet(k, camX - VW * 0.4 + (i % 3) * VW * 0.4, 4 - Math.floor(i / 3) * 2, 0xffffff, 1.6, 100, { aspect: k === 'slash' ? 2 : 1 });
        G.fx[G.fx.length - 1].t = u * 100; G.fx[G.fx.length - 1].step(u);
      });
    },
    // tests: cost of n full frames (simulation + rigs + draw submission), ms per frame
    bench(n = 60) {
      if (!G) return 0;
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { update(STEP); syncVisuals(STEP); renderer.render(scene, camera); drawOverlay(); }
      renderer.getContext().finish();
      return (performance.now() - t0) / n;
    },
    // tests: fire point n of a fighter in field coordinates (muzzle solver)
    muzzle: (f, n = 1) => muzzle(f, n),
    // tests: point the camera at world x (captures in a throttled preview, where the pan barely runs)
    look(x) { if (!G) return; pan = null; G.userCam = performance.now(); camX = x; clampCam(); updateCam(); },
    // tests: the enemy base rig (part checks)
    baseRig: () => G && G.baseRig,
    // tests: advance the battle by `sec` simulated seconds without drawing
    sim(sec) { for (let i = 0; i < sec / STEP && G && !G.over; i++) update(STEP); },
  };
})();
