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
  // features of a few neighbouring frames, merged (brightness-weighted): random bursts that land a frame apart
  // in the two engines are not counted as a difference
  function merge(fs) {
    const E = fs.reduce((t, f) => t + f.E, 0);
    if (E < 1) return { E: 0 };
    const w = (g) => fs.reduce((t, f) => t + (f.E ? g(f) * f.E : 0), 0) / E;
    return { E: E / fs.length, c: [0, 1, 2].map((i) => w((f) => f.c[i])), mx: w((f) => f.mx), my: w((f) => f.my), sx: w((f) => f.sx), sy: w((f) => f.sy) };
  }
  function score(a, b) { return scoreF(feat(a), feat(b)); }
  function scoreF(A, B) {
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
      else if ((CMP.gameBake || []).includes(name)) {
        // what the game draws for it: its own FXB playback (spawnStatic), with the game's hand tints
        const raw = FXB.raw; FXB.raw = false; const inst = FXB.create(name); FXB.raw = raw;
        scene.add(inst.root); obj = inst; step = (dt) => inst.update(dt);
      } else {
        const g = new THREE.Group(); scene.add(g); const L = SDPS.loose(CMP.trees[name], tex, CMP.rects, g, 0, VH); L.place(0, 0, 0); obj = L;
        // a projectile bake flew `dist` along +x in `T` (then the projectile is destroyed): fly ours the same way
        const proj = c.d.mode === 'proj' && c.d.T > 0, Tf = c.d.T, D = c.d.dist || 0;
        let tt = 0, gone = false;
        step = (dt) => {
          tt += dt;
          // the bake is in the projectile's own frame: it flies at dist/T and the view follows it, so only world-space
          // particles (trails) drift behind
          // stops at the target, as baked (Fx.cs keeps simulating there: emission goes on)
          if (proj) { const x = D * Math.min(1, tt / Tf); L.place(x, 0, 0); g.position.x = -x; }
          L.set.update(dt);
        };
      }
      let t = 0; const shots = [];
      step(0); // frame 0 already shows what spawned at once (Fx.cs: Simulate(0, restart) on the first frame)
      for (const T of tq) {
        // the bake's own fixed step (Fx.cs: Simulate(1 / fps) per frame), so loops wrap on the same frames
        while (t < T - 1e-6) { const dt = Math.min(1 / fps, T - t); step(dt); t += dt; } shots.push(shot(scene, cam)); }
      out.push(shots); obj.dispose();
    }
    return out;
  }
  // four moments inside what the Unity pass actually baked (later frames only repeat its last one)
  const timesFor = (name) => { const c = FXB.info(name), d = Math.max(1, c.d.nf - 1) / c.d.fps; return [0.15, 0.4, 0.65, 0.9].map((k) => k * d); };
  // particles are random: average several plays per effect so one unlucky burst does not decide the score
  // win: also the bake frames this many either side of each moment (merged features, both engines alike)
  function run(name, VH = 0.55, reps = 1, win = WIN) {
    const c = FXB.info(name).d, end = (c.nf - 1) / c.fps, base = timesFor(name), ts = [];
    base.forEach((T) => { for (let j = -win; j <= win; j++) ts.push(Math.min(end, Math.max(0, T + j / c.fps))); });
    const n = 2 * win + 1;
    let acc = null, last;
    for (let k = 0; k < reps; k++) {
      last = render(name, ts, VH);
      const s = base.map((_, i) => scoreF(merge(last[0].slice(i * n, i * n + n).map(feat)), merge(last[1].slice(i * n, i * n + n).map(feat))));
      acc = acc ? acc.map((v, i) => v + s[i]) : s;
    }
    const mid = (arr) => base.map((_, i) => arr[i * n + win]);
    return { s: acc.map((v) => Math.round(v / reps)), u: mid(last[0]), o: mid(last[1]) };
  }
  let WIN = 0; // measured: merging neighbour frames changed nothing material, so single frames stay the default
  // Distribution score for random effects: Unity's bake is one seeded outcome (Fx.cs randomSeed 12345; the game
  // itself plays a new random outcome every time). Each feature of the bake frame is compared with the nearest value
  // inside the 10-90% band of `reps` plays of ours: an outcome our engine would also produce scores 100, a
  // systematic difference (too big, too dim, misplaced) still loses points as in run().
  function runDist(name, VH = 0.55, reps = 16) {
    const ts = timesFor(name), ours = ts.map(() => []);
    let U;
    for (let k = 0; k < reps; k++) { const [u, o] = render(name, ts, VH); U = u; o.forEach((cv, i) => ours[i].push(feat(cv))); }
    const band = (vals) => { const v = vals.slice().sort((a, b) => a - b), q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]; return [q(0.1), q(0.9)]; };
    const near = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));
    const s = ts.map((_, i) => {
      const A = feat(U[i]), fs = ours[i], lit = fs.filter((f) => f.E > 0);
      const Eb = band(fs.map((f) => f.E));
      if (!A.E || !lit.length) return scoreF(A, { E: near(A.E || 0, Eb), c: [0, 0, 0], mx: 0, my: 0, sx: 0, sy: 0 });
      const pick = (g) => near(g(A), band(lit.map(g)));
      return scoreF(A, { E: near(A.E, Eb), c: [0, 1, 2].map((j) => pick((f) => f.c[j])), mx: pick((f) => f.mx), my: pick((f) => f.my), sx: pick((f) => f.sx), sy: pick((f) => f.sy) });
    });
    return { s: s.map(Math.round) };
  }
  function runAllDist(VH = 0.55, names = Object.keys(CMP.trees), reps = 16) {
    const res = {};
    for (const n of names) { const s = runDist(n, VH, reps).s; res[n] = { s, avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length) }; }
    const avgs = Object.values(res).map((r) => r.avg);
    return { res, avg: avgs.reduce((a, b) => a + b, 0) / avgs.length, below: Object.entries(res).filter(([, r]) => r.avg < 90).map(([n, r]) => n + ':' + r.avg) };
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
  window.CMPH = { runDist, runAllDist, win: (w) => { WIN = w; }, size, init, run, runAll, show, feat, render };
})();
