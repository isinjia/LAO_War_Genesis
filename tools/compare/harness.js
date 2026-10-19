// Side-by-side check of js/particles.js against the original Unity bake (js/fx, played by js/fxbake.js).
// Load on the game page (?unlock=1) after tools/compare/cmp.js:  await CMPH.init(); CMPH.runAll()
// Score per frame (100): brightness 35, mean colour 25, spread 20, position 20 (particles are random: no pixel diff).
(function () {
  let W = 300, H = 220; // thin streaks need the resolution
  const BG = [0x2a, 0x3a, 0x2a];
  let rnd, tex;
  async function init() {
    SDPS.trailBake(true); // trails as the Unity bake drew them (see js/particles.js)
    const names = Object.keys(CMP.trees);
    FXB.raw = true; // the reference is the Unity bake itself, without the game's hand tints
    await Promise.all(names.map((n) => FXB.prepare(n)));
    // createImageBitmap: Image.decode() stalls while the page is in the background
    const bm = await createImageBitmap(await fetch(CMP.img).then((r) => r.blob()));
    const img = document.createElement('canvas'); img.width = bm.width; img.height = bm.height; img.getContext('2d').drawImage(bm, 0, 0);
    tex = new THREE.Texture(img); tex.needsUpdate = true;
    rnd = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); rnd.setSize(W, H); rnd.setPixelRatio(1);
    return names.filter((n) => FXB.ready(n)).length;
  }
  function shot(scene, cam) { rnd.render(scene, cam); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(rnd.domElement, 0, 0); return cv; }
  function feat(cv) {
    const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
    let E = 0, cr = 0, cg = 0, cb = 0, sx = 0, sy = 0, sxx = 0, syy = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, e = Math.abs(d[i] - BG[0]) + Math.abs(d[i + 1] - BG[1]) + Math.abs(d[i + 2] - BG[2]);
      if (e < 12) continue;
      E += e; cr += d[i] * e; cg += d[i + 1] * e; cb += d[i + 2] * e; sx += x * e; sy += y * e; sxx += x * x * e; syy += y * y * e;
    }
    if (E < 1) return { E: 0 };
    const mx = sx / E, my = sy / E;
    return { E, c: [cr / E, cg / E, cb / E], mx, my, sx: Math.sqrt(Math.max(0, sxx / E - mx * mx)), sy: Math.sqrt(Math.max(0, syy / E - my * my)) };
  }
  function score(a, b) {
    const A = feat(a), B = feat(b);
    if (Math.max(A.E, B.E) < 3000 * W * H / 16500) return 100; // both (nearly) empty: the 150x110 threshold, scaled
    if (!A.E || !B.E) return 0;
    const sE = Math.min(A.E, B.E) / Math.max(A.E, B.E);
    const sC = 1 - (Math.abs(A.c[0] - B.c[0]) + Math.abs(A.c[1] - B.c[1]) + Math.abs(A.c[2] - B.c[2])) / (3 * 255);
    const sa = Math.hypot(A.sx, A.sy), sb = Math.hypot(B.sx, B.sy);
    const sS = Math.min(sa, sb) / Math.max(sa, sb, 1e-6);
    const sP = Math.max(0, 1 - Math.hypot(A.mx - B.mx, A.my - B.my) / (Math.hypot(W, H) * 0.5));
    return 100 * (0.35 * sE + 0.25 * sC + 0.2 * sS + 0.2 * sP);
  }
  function render(name, times, VH) {
    const c = FXB.info(name), k = c.d.scale / 32767, fps = c.d.fps, P = c.bin.p;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < P.length; i += 2) { const x = P[i] * k, y = P[i + 1] * k; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ext = Math.max(x1 - x0, (y1 - y0) * W / H) * 0.55 + 0.05;
    const cam = new THREE.OrthographicCamera(cx - ext, cx + ext, cy + ext * H / W, cy - ext * H / W, -100, 100);
    const tq = times.map((T) => Math.floor(T * fps + 1e-4) / fps); // the bake's own frame times
    const out = [];
    for (const side of ['unity', 'ours']) {
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a3a2a);
      let obj, step;
      if (side === 'unity') { const inst = FXB.create(name); scene.add(inst.root); obj = inst; step = (dt) => inst.update(dt); }
      else {
        const g = new THREE.Group(); scene.add(g); const L = SDPS.loose(CMP.trees[name], tex, CMP.rects, g, 0, VH); L.place(0, 0, 0); obj = L;
        // a projectile bake flew `dist` along +x in `T` (then the projectile is destroyed): fly ours the same way
        const proj = c.d.mode === 'proj' && c.d.T > 0, Tf = c.d.T, D = c.d.dist || 0;
        let tt = 0, gone = false;
        step = (dt) => {
          tt += dt;
          // the bake is in the projectile's own frame: it flies at dist/T and the view follows it, so only world-space
          // particles (trails) drift behind
          // stops at the target, as baked, and emits nothing more (what was emitted plays out)
          if (proj) { const x = D * Math.min(1, tt / Tf); L.place(x, 0, 0); g.position.x = -x; L.set.halt = tt > Tf; }
          L.set.update(dt);
        };
      }
      let t = 0; const shots = [];
      for (const T of tq) { if (t === 0) { step(1e-3); t = 1e-3; } // frame 0 already shows what spawned on the first update
        while (t < T - 1e-6) { const dt = Math.min(1 / 60, T - t); step(dt); t += dt; } shots.push(shot(scene, cam)); }
      out.push(shots); obj.dispose();
    }
    return out;
  }
  // four moments inside what the Unity pass actually baked (later frames only repeat its last one)
  const timesFor = (name) => { const c = FXB.info(name), d = Math.max(1, c.d.nf - 1) / c.d.fps; return [0.15, 0.4, 0.65, 0.9].map((k) => k * d); };
  // particles are random: average several plays per effect so one unlucky burst does not decide the score
  function run(name, VH = 0.55, reps = 1) {
    let acc = null, last;
    for (let k = 0; k < reps; k++) { last = render(name, timesFor(name), VH); const s = last[0].map((cv, i) => score(cv, last[1][i])); acc = acc ? acc.map((v, i) => v + s[i]) : s; }
    return { s: acc.map((v) => Math.round(v / reps)), u: last[0], o: last[1] };
  }
  function runAll(VH = 0.55, names = Object.keys(CMP.trees), reps = 4) {
    const res = {};
    for (const n of names) { const s = run(n, VH, reps).s; res[n] = { s, avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length) }; }
    const avgs = Object.values(res).map((r) => r.avg);
    return { res, avg: avgs.reduce((a, b) => a + b, 0) / avgs.length, below: Object.entries(res).filter(([, r]) => r.avg < 90).map(([n, r]) => n + ':' + r.avg) };
  }
  function show(names, VH = 0.55) {
    let host = document.getElementById('capHost');
    if (!host) { host = document.createElement('div'); host.id = 'capHost'; host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#111;padding:2px;display:flex;flex-wrap:wrap;gap:2px;align-content:flex-start;font:10px sans-serif;color:#ff0;overflow:auto'; document.body.appendChild(host); }
    host.innerHTML = '<div style="width:100%">왼쪽=원작 Unity, 오른쪽=우리 엔진 (0.05/0.15/0.3/0.5초)</div>';
    for (const n of names) {
      const r = run(n, VH), row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:2px;align-items:center';
      row.innerHTML = '<span style="width:80px">' + n.slice(0, 24) + '<br>' + r.s.join(',') + '</span>';
      for (let i = 0; i < 4; i++) { const pair = document.createElement('div'); pair.style.cssText = 'display:flex;gap:1px;margin-right:4px;border:1px solid #444'; r.u[i].style.width = '75px'; r.o[i].style.width = '75px'; pair.appendChild(r.u[i]); pair.appendChild(r.o[i]); row.appendChild(pair); }
      host.appendChild(row);
    }
  }
  function size(w, h) { W = w; H = h; rnd.setSize(W, H); }
  window.CMPH = { size, init, run, runAll, show, feat, render };
})();
