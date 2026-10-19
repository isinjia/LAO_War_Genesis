// Unity ParticleSystems of the SD rigs, played on the page (exported by tools/particles.py into rig nodes as n.ps).
// A system plays when its node becomes active (playOnAwake) and is cleared when the node turns off, as in Unity.
// Modules: main (lifetime / speed / size / rotation / colour / gravity), emission (rate + bursts), shape (cone, sphere,
// hemisphere, box, circle, edge), colour / size / rotation over lifetime, velocity / force over lifetime, limit
// velocity (dampen / drag), texture sheet animation, billboard / stretched / horizontal renderers, sub-emitters.
// Particles are drawn in the rig's model space as children of the body mesh, so they follow its flip and pin offset.
(function () {
  'use strict';
  // the Unity bake's trails never aged and first showed 0.1 s in: tools/compare reproduces that, the game does not
  let TRAIL_AGE = true, TRAIL_HOLD = 0;
  let GEO_VIEW = false; // mesh particles keep their node rotation (Thetis: the bolt shell's poles point backwards)
  let MESH_K = 1; // mesh sizes are exported in Unity units (FBX file scale applied)
  const MAX_PER_RIG = 600; // per character: crowds of units stay cheap

  // Unity effect textures have no mipmaps (importer default for sprites / effects): a streak squeezed to a few pixels
  // samples its bright core, not an average of its whole height. The rig atlas keeps mipmaps for the bodies, so
  // particle materials read level 0 (a large negative bias).
  function noMip(shader) {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('texture2D( map, vUv )', 'texture2D( map, vUv, -16.0 )'));
  }

  // Vertex alpha is not clamped here: Unity's particle shaders multiply 2 x tint x vertex alpha by the texture's alpha
  // and only the blend clamps the result, so a strong tint keeps soft texture edges bright.

  // ── curves ─────────────────────────────────────────────
  function curve(k, t) {
    if (!k || !k.length) return 1;
    if (t <= k[0][0]) return k[0][1];
    const n = k.length;
    if (t >= k[n - 1][0]) return k[n - 1][1];
    for (let i = 0; i < n - 1; i++) {
      const a = k[i], b = k[i + 1];
      if (t >= a[0] && t <= b[0]) {
        const dt = b[0] - a[0];
        if (dt <= 0) return b[1];
        const m0 = a[3], m1 = b[2];
        if (Math.abs(m0) > 1e8 || Math.abs(m1) > 1e8) return a[1]; // stepped key
        const u = (t - a[0]) / dt, u2 = u * u, u3 = u2 * u;
        return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * m0 * dt + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * m1 * dt;
      }
    }
    return k[n - 1][1];
  }
  function mm(c, t, r) {
    if (!c) return 0;
    switch (c.m) {
      case 0: return c.s;
      case 1: return c.s * curve(c.c, t);
      case 2: { const a = curve(c.d, t), b = curve(c.c, t); return c.s * (a + (b - a) * r); }
      case 3: return c.a + (c.s - c.a) * r;
      default: return c.s;
    }
  }
  function gradAt(g, t, out) {
    const ck = g.c, ak = g.a;
    let r = 1, gg = 1, b = 1, a = 1;
    if (ck && ck.length) {
      if (t <= ck[0][0] || ck.length === 1) { r = ck[0][1]; gg = ck[0][2]; b = ck[0][3]; } else if (t >= ck[ck.length - 1][0]) { const k = ck[ck.length - 1]; r = k[1]; gg = k[2]; b = k[3]; } else {
        for (let i = 0; i < ck.length - 1; i++) {
          const p = ck[i], q = ck[i + 1];
          if (t >= p[0] && t <= q[0]) {
            const u = g.f ? 0 : (t - p[0]) / Math.max(1e-6, q[0] - p[0]);
            r = p[1] + (q[1] - p[1]) * u; gg = p[2] + (q[2] - p[2]) * u; b = p[3] + (q[3] - p[3]) * u;
            break;
          }
        }
      }
    }
    if (ak && ak.length) {
      if (t <= ak[0][0] || ak.length === 1) a = ak[0][1]; else if (t >= ak[ak.length - 1][0]) a = ak[ak.length - 1][1]; else {
        for (let i = 0; i < ak.length - 1; i++) {
          const p = ak[i], q = ak[i + 1];
          if (t >= p[0] && t <= q[0]) { const u = g.f ? 0 : (t - p[0]) / Math.max(1e-6, q[0] - p[0]); a = p[1] + (q[1] - p[1]) * u; break; }
        }
      }
    }
    out[0] = r; out[1] = gg; out[2] = b; out[3] = a;
    return out;
  }
  const _c0 = [1, 1, 1, 1], _c1 = [1, 1, 1, 1];
  function mg(c, t, r, out) {
    if (!c) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
    switch (c.m) {
      case 0: out[0] = c.c0[0]; out[1] = c.c0[1]; out[2] = c.c0[2]; out[3] = c.c0[3]; return out;
      case 1: return gradAt(c.g0, t, out);
      case 2: for (let i = 0; i < 4; i++) out[i] = c.c1[i] + (c.c0[i] - c.c1[i]) * r; return out;
      case 3: gradAt(c.g0, t, _c0); gradAt(c.g1, t, _c1); for (let i = 0; i < 4; i++) out[i] = _c1[i] + (_c0[i] - _c1[i]) * r; return out;
      case 4: return gradAt(c.g0, r, out);
      default: out[0] = out[1] = out[2] = out[3] = 1; return out;
    }
  }

  // Unity euler (degrees, applied Z then X then Y) -> rotation of a vector
  function eulerRot(d) {
    const rx = d[0] * Math.PI / 180, ry = d[1] * Math.PI / 180, rz = d[2] * Math.PI / 180;
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    return (v) => {
      let x = v[0] * cz - v[1] * sz, y = v[0] * sz + v[1] * cz, z = v[2];
      const y2 = y * cx - z * sx, z2 = y * sx + z * cx; y = y2; z = z2;
      const x2 = x * cy + z * sy, z3 = -x * sy + z * cy; x = x2; z = z3;
      v[0] = x; v[1] = y; v[2] = z; return v;
    };
  }

  // a point and direction on the emitter shape, in the system's local Unity space
  const _p = [0, 0, 0], _d = [0, 0, 1];
  function sampleShape(sh) {
    _p[0] = _p[1] = _p[2] = 0; _d[0] = 0; _d[1] = 0; _d[2] = 1;
    if (!sh) return;
    const R = sh.r * (1 - sh.rt * 0 + 0), arc = (sh.arc || 360) * Math.PI / 180;
    const rr = () => R * (1 - (sh.rt || 0) * 0) * Math.sqrt(1 - (sh.rt != null ? sh.rt : 1) + (sh.rt != null ? sh.rt : 1) * Math.random());
    switch (sh.type) {
      case 0: case 1: case 2: case 3: { // sphere / hemisphere (+ shells): outward from the centre
        let x, y, z, l;
        do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-4);
        l = Math.sqrt(l);
        x /= l; y /= l; z /= l;
        if (sh.type >= 2 && z < 0) z = -z;
        const d = rr();
        _p[0] = x * d; _p[1] = y * d; _p[2] = z * d; _d[0] = x; _d[1] = y; _d[2] = z;
        break;
      }
      case 4: case 7: case 8: case 9: { // cone: from a circle of radius r, spreading by the cone angle along +Z
        const a = Math.random() * arc, d = rr(), ang = (sh.angle || 0) * Math.PI / 180;
        const ca = Math.cos(a), sa = Math.sin(a), k = R > 0 ? d / R : Math.random();
        _p[0] = ca * d; _p[1] = sa * d; _p[2] = 0;
        const s = Math.sin(ang * k), c = Math.cos(ang * k);
        _d[0] = ca * s; _d[1] = sa * s; _d[2] = c;
        if (sh.type >= 8) { const L = Math.random() * (sh.len || 0); _p[0] += _d[0] * L; _p[1] += _d[1] * L; _p[2] += _d[2] * L; }
        break;
      }
      case 5: case 15: case 16: { // box: anywhere inside, moving along +Z
        _p[0] = (Math.random() - 0.5) * sh.sc[0]; _p[1] = (Math.random() - 0.5) * sh.sc[1]; _p[2] = (Math.random() - 0.5) * sh.sc[2];
        break;
      }
      case 10: case 11: { // circle (in XY), outward
        const a = Math.random() * arc, d = rr();
        _d[0] = Math.cos(a); _d[1] = Math.sin(a); _d[2] = 0;
        _p[0] = _d[0] * d; _p[1] = _d[1] * d;
        break;
      }
      case 12: { // single-sided edge along X, moving up (+Y)
        _p[0] = (Math.random() * 2 - 1) * R; _d[0] = 0; _d[1] = 1; _d[2] = 0;
        break;
      }
      case 18: { // rectangle (XY plane)
        _p[0] = (Math.random() - 0.5) * sh.sc[0]; _p[1] = (Math.random() - 0.5) * sh.sc[1];
        break;
      }
      default: break;
    }
    if (sh.type !== 5 && sh.type !== 18 && sh.type !== 15 && sh.type !== 16) { _p[0] *= sh.sc[0]; _p[1] *= sh.sc[1]; _p[2] *= sh.sc[2]; }
    if (sh.rd > 0) { // random direction amount
      let x, y, z, l;
      do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-4);
      l = Math.sqrt(l);
      _d[0] += (x / l - _d[0]) * sh.rd; _d[1] += (y / l - _d[1]) * sh.rd; _d[2] += (z / l - _d[2]) * sh.rd;
    }
    if (sh.rotd && (sh.rotd[0] || sh.rotd[1] || sh.rotd[2])) { const f = sh._rot || (sh._rot = eulerRot(sh.rotd)); f(_p); f(_d); }
    _p[0] += sh.pos[0]; _p[1] += sh.pos[1]; _p[2] += sh.pos[2];
  }

  // ── a system on one rig node ───────────────────────────
  class System {
    constructor(set, node, def) {
      this.set = set; this.node = node; this.def = def;
      this.on = false; this.t = 0; this.acc = 0; this.delay = 0; this.burst = def.emit.b.map(() => 0);
      this.n = 0;
      const M = Math.min(def.max || 200, 400);
      this.cap = M;
      this.P = new Float32Array(M * 16); // x y z vx vy vz age life size sizeY rot rotv r1 r2 r3 r4
      this.C = new Float32Array(M * 4); // start colour
      this.lastWorld = false;
    }
    play() {
      this.at = this.set.clock; // when it started (the game asks which effects belong to the current attack)
      this.on = true; this.t = 0; this.acc = 0; this.burst.fill(0); this.delay = mm(this.def.delay, 0, Math.random());
      // a spawned (CreateObject) effect stays where it was created: its matrix is copied once
      if (this.def.det) { const o = this.node * 12; this.Ws = (this.Ws && this.n ? new Float32Array(12) : this.Ws || new Float32Array(12)); this.Ws.set(this.set.W.subarray(o, o + 12)); }
    }
    clear() { this.n = 0; this.on = false; }
    // the node's world matrix in rig space (3x4, column-major)
    emit(count, W, o, x0, y0) {
      const d = this.def, P = this.P, C = this.C, sp = this.set.sd;
      const world = d.space === 1;
      const nt = d.dur > 0 ? Math.min(1, this.t / d.dur) : 0;
      for (let k = 0; k < count; k++) {
        if (this.n >= this.cap || this.set.total >= MAX_PER_RIG) return;
        const i = this.n++; this.set.total++;
        const b = i * 16;
        sampleShape(d.shape);
        // Unity (left-handed) -> rig space: z mirrored
        let px = _p[0], py = _p[1], pz = -_p[2], dx = _d[0], dy = _d[1], dz = -_d[2];
        if (x0 != null) { px = 0; py = 0; pz = 0; }
        const speed = mm(d.speed, nt, Math.random());
        let vx = dx * speed, vy = dy * speed, vz = dz * speed;
        if (world) {
          const wx = W[o] * px + W[o + 3] * py + W[o + 6] * pz + W[o + 9], wy = W[o + 1] * px + W[o + 4] * py + W[o + 7] * pz + W[o + 10];
          const wz = W[o + 2] * px + W[o + 5] * py + W[o + 8] * pz + W[o + 11];
          const ux = W[o] * vx + W[o + 3] * vy + W[o + 6] * vz, uy = W[o + 1] * vx + W[o + 4] * vy + W[o + 7] * vz, uz = W[o + 2] * vx + W[o + 5] * vy + W[o + 8] * vz;
          px = x0 != null ? x0 : wx; py = y0 != null ? y0 : wy; pz = wz; vx = ux; vy = uy; vz = uz;
        } else if (x0 != null) { px = x0; py = y0; }
        P[b] = px; P[b + 1] = py; P[b + 2] = pz; P[b + 3] = vx; P[b + 4] = vy; P[b + 5] = vz;
        P[b + 6] = 0; P[b + 7] = Math.max(0.01, mm(d.life, nt, Math.random()));
        const sz = mm(d.size, nt, Math.random());
        P[b + 8] = sz; P[b + 9] = d.s3 ? mm(d.sy, nt, Math.random()) : sz;
        P[b + 10] = mm(d.rot, nt, Math.random()) * (d.rdir && Math.random() < d.rdir ? -1 : 1);
        P[b + 11] = 0;
        P[b + 12] = Math.random(); P[b + 13] = Math.random(); P[b + 14] = Math.random(); P[b + 15] = Math.random();
        const c = mg(d.color, nt, Math.random(), _c0);
        C[i * 4] = c[0]; C[i * 4 + 1] = c[1]; C[i * 4 + 2] = c[2]; C[i * 4 + 3] = c[3];
        if (sp && this.subBirth) this.subBirth(px, py);
      }
    }
    update(dt, active, W) {
      const d = this.def, o = this.node * 12;
      if (!active) {
        this.on = false; this.wasOn = false;
        if (!d.det || !this.n) { if (this.n) { this.set.total -= this.n; this.n = 0; } return; } // a spawned effect plays out
      } else if (!this.wasOn) { this.wasOn = true; if (d.awake && !d.isSub) this.play(); }
      dt *= d.sim || 1;
      // emission (a set can be halted: its particles play out, nothing new starts)
      if (this.on && !this.set.halt) {
        if (this.delay > 0) this.delay -= dt; else {
          const prev = this.t;
          this.t += dt;
          const nt = d.dur > 0 ? Math.min(1, this.t / d.dur) : 0;
          const rate = mm(d.emit.rate, nt, Math.random());
          this.acc += rate * dt;
          const ne = Math.floor(this.acc);
          const Mx = this.Ws || this.set.W, mo = this.Ws ? 0 : o;
          if (ne > 0) { this.acc -= ne; this.emit(ne, Mx, mo); }
          const bursts = (from) => d.emit.b.forEach((bu, k) => {
            const cyc = bu.cyc || 1;
            while (this.burst[k] < cyc && this.t >= bu.t + this.burst[k] * (bu.iv || 0.01) && from <= bu.t + this.burst[k] * (bu.iv || 0.01) + 1e-6 + (this.t - from)) {
              this.burst[k]++;
              if (Math.random() <= (bu.p == null ? 1 : bu.p)) this.emit(Math.round(mm(bu.n, 0, Math.random())), Mx, mo);
            }
          });
          bursts(prev);
          if (this.t >= d.dur) {
            // a loop wraps: the new cycle's bursts that are already due fire in this same step, as in Unity
            if (d.loop) { this.t %= Math.max(0.01, d.dur); this.burst.fill(0); bursts(0); } else this.on = false;
          }
        }
      }
      // simulation
      const P = this.P, C = this.C, g = -9.81;
      let w = 0;
      for (let i = 0; i < this.n; i++) {
        const b = i * 16;
        P[b + 6] += dt;
        if (P[b + 6] >= P[b + 7]) { // dies
          if (this.subDeath) this.subDeath(P[b], P[b + 1], d.space === 1);
          continue;
        }
        const t = P[b + 6] / P[b + 7];
        const gm = mm(d.grav, t, P[b + 12]);
        P[b + 4] += g * gm * dt;
        if (d.frc) { P[b + 3] += mm(d.frc.x, t, P[b + 13]) * dt; P[b + 4] += mm(d.frc.y, t, P[b + 13]) * dt; P[b + 5] -= mm(d.frc.z, t, P[b + 13]) * dt; }
        if (d.clamp) {
          // Limit Velocity: the excess over the limit loses `dampen` of itself per 30 fps frame (rate independent),
          // before this step moves the particle
          const lim = mm(d.clamp.mag, t, P[b + 15]), sp = Math.hypot(P[b + 3], P[b + 4], P[b + 5]);
          if (sp > lim && sp > 0) {
            const dm = 1 - Math.pow(1 - Math.min(1, d.clamp.damp || 0), dt * 30);
            const k = 1 - (1 - lim / sp) * dm; P[b + 3] *= k; P[b + 4] *= k; P[b + 5] *= k;
          }
          const drag = mm(d.clamp.drag, t, P[b + 15]);
          if (drag > 0) { const k = Math.max(0, 1 - drag * dt); P[b + 3] *= k; P[b + 4] *= k; P[b + 5] *= k; }
        }
        let vx = P[b + 3], vy = P[b + 4], vz = P[b + 5];
        if (d.vel) { vx += mm(d.vel.x, t, P[b + 14]); vy += mm(d.vel.y, t, P[b + 14]); vz -= mm(d.vel.z, t, P[b + 14]); }
        P[b] += vx * dt; P[b + 1] += vy * dt; P[b + 2] += vz * dt;
        if (d.rv) P[b + 11] += mm(d.rv, t, P[b + 13]) * dt;
        if (w !== i) { P.copyWithin(w * 16, b, b + 16); C.copyWithin(w * 4, i * 4, i * 4 + 4); }
        w++;
      }
      this.set.total -= this.n - w;
      this.n = w;
    }
  }

  // ── all systems of one character, drawn by two meshes (normal / additive) ─
  // src: { nodes (with .ps), W (3x4 per node), EA (active per node), tex, rects, parent (Object3D), order() }
  class Set {
    constructor(sd, src) {
      this.sd = sd; this.total = 0;
      // viewH: the view's height in this set's units, for Unity's Max Particle Size (a fraction of the view height)
      this.src = src || { nodes: sd.tpl.data.nodes, W: sd.W, EA: sd.EA, tex: sd.tpl.atlas.tex, rects: sd.tpl.atlas.rects,
        parent: sd.mesh, order: () => sd.mesh.renderOrder || 0,
        viewH: () => (window.SDPS && SDPS.viewH ? SDPS.viewH / (Math.abs(sd.root.scale.y) || 1) : 0) };
      const nodes = this.src.nodes;
      this.sys = [];
      const byNode = {};
      // full-screen dimmers / flashes of the original (plain "black", "white", "back", "BG" quads) are not part of the unit
      const SCREEN = /^(black|white|back|bg|fx_back)( ?\(\d+\))?$/i;
      nodes.forEach((n, i) => { if (n.ps && !SCREEN.test(n.n)) { const s = new System(this, i, n.ps); this.sys.push(s); byNode[i] = s; } });
      // sub-emitters: birth (0) / death (1) of the parent's particles start a burst of the child system there
      for (const s of this.sys) {
        for (const [ci, ty] of s.def.subs || []) {
          const c = byNode[ci];
          if (!c) continue;
          const burstN = () => Math.max(1, Math.round(c.def.emit.b.reduce((a, bu) => a + mm(bu.n, 0, 0.5), 0)) || 3);
          const fire = (x, y, world) => { if (!c.wasOn) return; c.emit(burstN(), this.W, c.node * 12, world ? x : null, world ? y : null); };
          if (ty === 0) s.subBirth = (x, y) => fire(x, y, s.def.space === 1);
          if (ty === 1) s.subDeath = fire;
        }
      }
      this.W = this.src.W;
      // quads: the particle budget plus room for real meshes (one quad per mesh polygon and particle)
      const M = this.M = MAX_PER_RIG + this.sys.reduce((a, c) => a + (c.def.r.geo ? (c.def.r.geo.p.length / 12) * (c.def.r.gn || 1) : 0), 0);
      this.mk = (add) => {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(M * 4 * 3), uv = new Float32Array(M * 4 * 2), col = new Float32Array(M * 4 * 4);
        const idx = new Uint16Array(M * 6);
        for (let i = 0; i < M; i++) { idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6); }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.setDrawRange(0, 0);
        const mat = new THREE.MeshBasicMaterial({ map: this.src.tex, vertexColors: true, transparent: true, depthTest: false, depthWrite: false,
          side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
        mat.onBeforeCompile = noMip; mat.customProgramCacheKey = () => 'sdps-nomip';
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = this.src.order() + 2;
        this.src.parent.add(mesh);
        return { mesh, pos, uv, col };
      };
      this.layers = [this.mk(false), this.mk(true)];
      // TrailRenderers: the ribbon a moving node leaves (projectile tails)
      this.trails = [];
      nodes.forEach((n, i) => { if (n.tr) this.trails.push({ node: i, d: n.tr, pts: [] }); });
    }
    // systems that started within the last `sec` seconds and are still showing
    recent(sec) { return this.sys.some((s) => (s.on || s.n) && this.clock - (s.at || -1e9) <= sec); }
    update(dt) {
      this.clock = (this.clock || 0) + dt;
      const EA = this.src.EA, W = this.src.W;
      for (const s of this.sys) s.update(dt, !!EA[s.node], W);
      for (const tr of this.trails) {
        const o = tr.node * 12, x = W[o + 9], y = W[o + 10];
        if (!EA[tr.node]) { tr.pts.length = 0; tr.head = null; continue; } // a disabled / destroyed object loses its trail
        const last = tr.pts[tr.pts.length - 1];
        if (!last || Math.hypot(x - last[0], y - last[1]) >= (tr.d.minv || 0.1)) tr.pts.push([x, y, this.clock]);
        tr.head = [x, y, this.clock];
        if (TRAIL_AGE) while (tr.pts.length && this.clock - tr.pts[0][2] > tr.d.time) tr.pts.shift();
      }
      this.draw();
    }
    // a model placed in the effect (FBX instance): its real quads through the node's 3D transform, z dropped
    drawGeo(s, L, rc, cnt, tint, Wd, o, li) {
      const g = s.def.r.geo, Pp = g.p, T = g.uv, d = s.def;
      for (let i = 0; i < s.n; i++) {
        const b = i * 16, t = s.P[b + 6] / s.P[b + 7], P = s.P;
        const k = P[b + 8] * MESH_K * (d.sz ? mm(d.sz.c, t, P[b + 13]) : 1);
        const rot = -(P[b + 10] + P[b + 11]), cs = Math.cos(rot), sn = Math.sin(rot);
        // the particle's place: local particles move in the node's frame, world ones are already placed
        const world = d.space === 1;
        // Render Alignment = View: the mesh keeps the camera's axes (only the node's scale applies)
        const view = GEO_VIEW && d.r.align === 0 && d.r.gn, vsx = Math.hypot(Wd[o], Wd[o + 1], Wd[o + 2]), vsy = Math.hypot(Wd[o + 3], Wd[o + 4], Wd[o + 5]);
        const ox = world ? P[b] : Wd[o] * P[b] + Wd[o + 3] * P[b + 1] + Wd[o + 6] * P[b + 2] + Wd[o + 9];
        const oy = world ? P[b + 1] : Wd[o + 1] * P[b] + Wd[o + 4] * P[b + 1] + Wd[o + 7] * P[b + 2] + Wd[o + 10];
        const c = d.col ? mg(d.col, t, s.P[b + 14], _c1) : null;
        let cr = s.C[i * 4] * tint[0], cg = s.C[i * 4 + 1] * tint[1], cb = s.C[i * 4 + 2] * tint[2], ca = s.C[i * 4 + 3] * tint[3];
        if (c) { cr *= c[0]; cg *= c[1]; cb *= c[2]; ca *= c[3]; }
        if (ca <= 0.003) continue;
        // texture sheet animation applies to the mesh's uvs too (Thetis' bolts: one frame of a 2x2 fire sheet)
        const uvm = d.uv, tx = uvm ? uvm.tx : 1, ty = uvm ? uvm.ty : 1, frames = tx * ty;
        let fx = 0, fy = 0;
        if (uvm && frames > 1) {
          const f0 = mm(uvm.sf, t, P[b + 15]);
          let f = Math.floor((mm(uvm.fot, t, P[b + 12]) * (uvm.cyc || 1) % 1) * (uvm.anim === 1 ? tx : frames) + f0);
          if (uvm.anim === 1) { const row = uvm.rr ? Math.floor(P[b + 15] * ty) : uvm.row; fx = ((f % tx) + tx) % tx; fy = row; } else { f = ((f % frames) + frames) % frames; fx = f % tx; fy = Math.floor(f / tx); }
        }
        const fu = rc[2] / tx, fv = rc[3] / ty, bu = rc[0] + fx * fu, bv = rc[1] + (1 - (fy + 1) / ty) * rc[3];
        for (let qd = 0; qd * 12 < Pp.length; qd++) {
          const q = cnt[li];
          if (q >= this.M) return;
          // atlas rects cannot wrap: shift the quad's uvs by whole tiles into 0..1
          const u0 = Math.floor(Math.min(T[qd * 8], T[qd * 8 + 2], T[qd * 8 + 4], T[qd * 8 + 6]) + 1e-4);
          const v0 = Math.floor(Math.min(T[qd * 8 + 1], T[qd * 8 + 3], T[qd * 8 + 5], T[qd * 8 + 7]) + 1e-4);
          for (let cc = 0; cc < 4; cc++) {
            const slot = cc === 2 ? 3 : cc === 3 ? 2 : cc; // polygon order 0 1 2 3 -> quad slots 0 1 3 2
            const pi = qd * 12 + cc * 3, mx = Pp[pi] * k, my = Pp[pi + 1] * k, z = -Pp[pi + 2] * k; // Unity -> rig space: z mirrored
            const x = cs * mx - sn * my, y = sn * mx + cs * my; // the particle's rotation (about its z)
            const pp = (q * 4 + slot) * 3, uu = (q * 4 + slot) * 2, ci = (q * 4 + slot) * 4;
            if (view) { L.pos[pp] = x * vsx + ox; L.pos[pp + 1] = y * vsy + oy; } else {
              L.pos[pp] = Wd[o] * x + Wd[o + 3] * y + Wd[o + 6] * z + ox;
              L.pos[pp + 1] = Wd[o + 1] * x + Wd[o + 4] * y + Wd[o + 7] * z + oy;
            }
            L.pos[pp + 2] = 0;
            L.uv[uu] = bu + Math.min(1, T[qd * 8 + cc * 2] - u0) * fu; L.uv[uu + 1] = bv + Math.min(1, T[qd * 8 + cc * 2 + 1] - v0) * fv;
            L.col[ci] = cr; L.col[ci + 1] = cg; L.col[ci + 2] = cb; L.col[ci + 3] = ca;
          }
          cnt[li] = q + 1;
        }
      }
    }
    draw() {
      const W = this.W, rects = this.src.rects;
      const cnt = [0, 0];
      const vh = this.src.viewH ? this.src.viewH() : 0;
      const ord = this.src.order();
      for (const L of this.layers) L.mesh.renderOrder = ord + 2;
      for (const s of this.sys) {
        if (!s.n) continue;
        const d = s.def, r = d.r, L = this.layers[r.add ? 1 : 0];
        let rc = rects[r.t];
        if (!rc) continue;
        if (r.sub) rc = [rc[0] + r.sub[0] * rc[2], rc[1] + r.sub[1] * rc[3], r.sub[2] * rc[2], r.sub[3] * rc[3]]; // a sprite's rect in its texture
        const Wd = s.Ws || W, o = s.Ws ? 0 : s.node * 12, world = d.space === 1;
        // the node's scale for particle size (hierarchy: world scale, local: own scale only)
        const nsx = Math.hypot(Wd[o], Wd[o + 1], Wd[o + 2]) || 1, nsy = Math.hypot(Wd[o + 3], Wd[o + 4], Wd[o + 5]) || 1;
        const sn = this.src.nodes[s.node].s || [1, 1, 1];
        const kx = d.scl === 0 ? nsx : d.scl === 1 ? Math.abs(sn[0]) : 1, ky = d.scl === 0 ? nsy : d.scl === 1 ? Math.abs(sn[1]) : 1;
        const tint = r.tint ? [r.tint[0] * 2, r.tint[1] * 2, r.tint[2] * 2, r.tint[3] * 2] : [1, 1, 1, 1];
        const uvm = d.uv, tx = uvm ? uvm.tx : 1, ty = uvm ? uvm.ty : 1, frames = tx * ty;
        const P = s.P, C = s.C;
        if (r.geo) { this.drawGeo(s, L, rc, cnt, tint, Wd, o, r.add ? 1 : 0); continue; }
        for (let i = 0; i < s.n; i++) {
          const q = cnt[r.add ? 1 : 0];
          if (q >= this.M) break;
          const b = i * 16, t = P[b + 6] / P[b + 7];
          let x = P[b], y = P[b + 1], z = P[b + 2];
          let vx = P[b + 3], vy = P[b + 4];
          if (!world) {
            const X = Wd[o] * x + Wd[o + 3] * y + Wd[o + 6] * z + Wd[o + 9], Y = Wd[o + 1] * x + Wd[o + 4] * y + Wd[o + 7] * z + Wd[o + 10];
            const VX = Wd[o] * vx + Wd[o + 3] * vy + Wd[o + 6] * P[b + 5], VY = Wd[o + 1] * vx + Wd[o + 4] * vy + Wd[o + 7] * P[b + 5];
            x = X; y = Y; vx = VX; vy = VY;
          }
          let sx = P[b + 8], sy = P[b + 9];
          if (d.sz) { const k = mm(d.sz.c, t, P[b + 13]); sx *= k; sy *= d.sz.sep ? mm(d.sz.y, t, P[b + 13]) : k; }
          if (r.mode !== 5) { sx *= kx; sy *= ky; }
          if (r.mode === 4 && r.mx) { sx *= r.mx[0] * MESH_K; sy *= r.mx[1] * MESH_K; } // Mesh mode: a quad the mesh's size
          else if (vh > 0 && r.maxs > 0) { const lim = r.maxs * vh; if (sx > lim) sx = lim; if (sy > lim) sy = lim; } // Max Particle Size
          const rot = -(P[b + 10] + P[b + 11]);
          // colour: start x over lifetime x material tint
          const c = d.col ? mg(d.col, t, P[b + 14], _c1) : null;
          let cr = C[i * 4] * tint[0], cg = C[i * 4 + 1] * tint[1], cb = C[i * 4 + 2] * tint[2], ca = C[i * 4 + 3] * tint[3];
          if (c) { cr *= c[0]; cg *= c[1]; cb *= c[2]; ca *= c[3]; }
          if (ca <= 0.003) continue;
          // corners: billboard (rotated), stretched along the velocity, horizontal (squashed: seen from the side)
          let ax, ay, bx, by; // half axes
          if (r.mode === 5) { // a sprite: the quad follows its node (position, rotation, scale)
            const fxs = r.fx ? -1 : 1;
            ax = Wd[o] * sx * 0.5 * fxs; ay = Wd[o + 1] * sx * 0.5 * fxs; bx = Wd[o + 3] * sy * 0.5; by = Wd[o + 4] * sy * 0.5;
            if (r.off) { x += Wd[o] * r.off[0] + Wd[o + 3] * r.off[1]; y += Wd[o + 1] * r.off[0] + Wd[o + 4] * r.off[1]; }
          } else if (r.mode === 1) {
            const sp = Math.hypot(vx, vy) || 1e-6, ux = vx / sp, uy = vy / sp;
            const len = sx * r.ls + sp * r.vs;
            ax = ux * len * 0.5; ay = uy * len * 0.5; bx = -uy * sx * 0.5; by = ux * sx * 0.5;
            x += ax * 0.0; y += ay * 0.0;
          } else if (r.align === 2) {
            // Render Alignment = Local: the quad lies in its node's plane (a flat ring on the ground is seen edge-on);
            // the node's axes as unit vectors in 3D, projected (z dropped)
            const l0 = Math.hypot(Wd[o], Wd[o + 1], Wd[o + 2]) || 1, l1 = Math.hypot(Wd[o + 3], Wd[o + 4], Wd[o + 5]) || 1;
            const ux = Wd[o] / l0, uy = Wd[o + 1] / l0, vx2 = Wd[o + 3] / l1, vy2 = Wd[o + 4] / l1;
            const cs = Math.cos(rot), sn2 = Math.sin(rot);
            ax = (cs * ux + sn2 * vx2) * sx * 0.5; ay = (cs * uy + sn2 * vy2) * sx * 0.5;
            bx = (-sn2 * ux + cs * vx2) * sy * 0.5; by = (-sn2 * uy + cs * vy2) * sy * 0.5;
          } else {
            const cs = Math.cos(rot), sn2 = Math.sin(rot), hy = r.mode === 2 ? sy * 0.35 : sy;
            ax = cs * sx * 0.5; ay = sn2 * sx * 0.5; bx = -sn2 * hy * 0.5; by = cs * hy * 0.5;
          }
          // renderer pivot (in particle sizes, along the quad's own axes): Thetis' missile flame sits behind the missile
          if (r.piv && r.mode !== 5 && (r.piv[0] || r.piv[1])) { x += 2 * (r.piv[0] * ax + r.piv[1] * bx); y += 2 * (r.piv[0] * ay + r.piv[1] * by); }
          // texture sheet frame
          let fx = 0, fy = 0;
          if (uvm && frames > 1) {
            const f0 = mm(uvm.sf, t, P[b + 15]);
            let f = Math.floor((mm(uvm.fot, t, P[b + 12]) * (uvm.cyc || 1) % 1) * (uvm.anim === 1 ? tx : frames) + f0);
            if (uvm.anim === 1) { const row = uvm.rr ? Math.floor(P[b + 15] * ty) : uvm.row; fx = ((f % tx) + tx) % tx; fy = row; } else { f = ((f % frames) + frames) % frames; fx = f % tx; fy = Math.floor(f / tx); }
          }
          const u0 = rc[0] + (fx / tx) * rc[2], u1 = rc[0] + ((fx + 1) / tx) * rc[2];
          const v1 = rc[1] + (1 - fy / ty) * rc[3], v0 = rc[1] + (1 - (fy + 1) / ty) * rc[3];
          const pp = q * 12, uu = q * 8, cc = q * 16;
          const pos = L.pos, uv = L.uv, col = L.col;
          pos[pp] = x - ax - bx; pos[pp + 1] = y - ay - by; pos[pp + 2] = 0;
          pos[pp + 3] = x + ax - bx; pos[pp + 4] = y + ay - by; pos[pp + 5] = 0;
          pos[pp + 6] = x - ax + bx; pos[pp + 7] = y - ay + by; pos[pp + 8] = 0;
          pos[pp + 9] = x + ax + bx; pos[pp + 10] = y + ay + by; pos[pp + 11] = 0;
          uv[uu] = u0; uv[uu + 1] = v0; uv[uu + 2] = u1; uv[uu + 3] = v0; uv[uu + 4] = u0; uv[uu + 5] = v1; uv[uu + 6] = u1; uv[uu + 7] = v1;
          for (let k = 0; k < 4; k++) { col[cc + k * 4] = cr; col[cc + k * 4 + 1] = cg; col[cc + k * 4 + 2] = cb; col[cc + k * 4 + 3] = ca; }
          cnt[r.add ? 1 : 0] = q + 1;
        }
      }
      // trails: quads between consecutive points, head (newest) to tail; width curve and colour gradient along it
      for (const tr of this.trails) {
        if (!tr.head || !tr.pts.length || this.clock < TRAIL_HOLD) continue;
        const d = tr.d, r = d.r, L = this.layers[r.add ? 1 : 0], rc = rects[r.t];
        if (!rc) continue;
        const P = [tr.head].concat(tr.pts.slice().reverse()); // head first
        let total = 0; const acc = [0];
        for (let i = 1; i < P.length; i++) { total += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); acc.push(total); }
        if (total < 1e-4) continue;
        const tint = r.tint ? [r.tint[0] * 2, r.tint[1] * 2, r.tint[2] * 2, r.tint[3] * 2] : [1, 1, 1, 1];
        const at = (i) => { const u = acc[i] / total; const w = (d.wc && d.wc.length ? curve(d.wc, u) : 1) * d.w; const c = gradAt(d.grad, u, [1, 1, 1, 1]); return { u, w, c }; };
        for (let i = 0; i < P.length - 1; i++) {
          const q = cnt[r.add ? 1 : 0];
          if (q >= this.M) break;
          const a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], ln = Math.hypot(dx, dy) || 1e-6;
          const nx = -dy / ln, ny = dx / ln, A = at(i), B = at(i + 1);
          const pp = q * 12, uu = q * 8, cc = q * 16, pos = L.pos, uv = L.uv, col = L.col;
          pos[pp] = a[0] - nx * A.w * 0.5; pos[pp + 1] = a[1] - ny * A.w * 0.5; pos[pp + 2] = 0;
          pos[pp + 3] = b[0] - nx * B.w * 0.5; pos[pp + 4] = b[1] - ny * B.w * 0.5; pos[pp + 5] = 0;
          pos[pp + 6] = a[0] + nx * A.w * 0.5; pos[pp + 7] = a[1] + ny * A.w * 0.5; pos[pp + 8] = 0;
          pos[pp + 9] = b[0] + nx * B.w * 0.5; pos[pp + 10] = b[1] + ny * B.w * 0.5; pos[pp + 11] = 0;
          const ua = rc[0] + A.u * rc[2], ub = rc[0] + B.u * rc[2]; // texture stretched along the trail
          uv[uu] = ua; uv[uu + 1] = rc[1]; uv[uu + 2] = ub; uv[uu + 3] = rc[1]; uv[uu + 4] = ua; uv[uu + 5] = rc[1] + rc[3]; uv[uu + 6] = ub; uv[uu + 7] = rc[1] + rc[3];
          for (const [k, C] of [[0, A], [1, B], [2, A], [3, B]]) {
            col[cc + k * 4] = C.c[0] * tint[0]; col[cc + k * 4 + 1] = C.c[1] * tint[1]; col[cc + k * 4 + 2] = C.c[2] * tint[2]; col[cc + k * 4 + 3] = C.c[3] * tint[3];
          }
          cnt[r.add ? 1 : 0] = q + 1;
        }
      }
      this.layers.forEach((L, k) => {
        const g = L.mesh.geometry;
        g.setDrawRange(0, cnt[k] * 6);
        if (cnt[k]) { g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true; g.attributes.color.needsUpdate = true; }
        L.mesh.visible = cnt[k] > 0;
      });
    }
    reset() { for (const s of this.sys) { s.n = 0; s.on = false; s.wasOn = false; } for (const tr of this.trails) { tr.pts.length = 0; tr.head = null; } this.total = 0; this.draw(); }
    dispose() { for (const L of this.layers) { L.mesh.parent && L.mesh.parent.remove(L.mesh); L.mesh.geometry.dispose(); L.mesh.material.dispose(); } }
  }

  // ── effects outside a rig: the original projectiles and their hit effects ──
  // a node tree {p, t, q, s, ps} with its own world matrices; the root follows a path in the group's space
  const live = [];
  function trs(nodes, W, root) {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], o = i * 12;
      // Unity -> three (z mirrored), as the rigs
      const x = -n.q[0], y = -n.q[1], z = n.q[2], w = n.q[3], sx = n.s[0], sy = n.s[1], sz = n.s[2];
      const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
      const L = [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy,
        (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, n.t[0], n.t[1], -n.t[2]];
      const P = n.p >= 0 ? W.subarray(n.p * 12, n.p * 12 + 12) : root;
      for (let c = 0; c < 4; c++) {
        const a = L[c * 3], b = L[c * 3 + 1], d = L[c * 3 + 2];
        W[o + c * 3] = P[0] * a + P[3] * b + P[6] * d + (c === 3 ? P[9] : 0);
        W[o + c * 3 + 1] = P[1] * a + P[4] * b + P[7] * d + (c === 3 ? P[10] : 0);
        W[o + c * 3 + 2] = P[2] * a + P[5] * b + P[8] * d + (c === 3 ? P[11] : 0);
      }
    }
  }
  class Loose {
    constructor(nodes, tex, rects, parent, order) {
      this.nodes = nodes; this.W = new Float32Array(nodes.length * 12); this.EA = new Uint8Array(nodes.length);
      nodes.forEach((n, i) => { this.EA[i] = n.a == null || n.a ? 1 : 0; });
      for (let i = 0; i < nodes.length; i++) if (nodes[i].p >= 0 && !this.EA[nodes[i].p]) this.EA[i] = 0;
      this.root = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
      trs(nodes, this.W, this.root);
      this.set = new Set(null, { nodes, W: this.W, EA: this.EA, tex, rects, parent, order: () => order });
    }
    place(x, y, ang) { const c = Math.cos(ang), s = Math.sin(ang); this.root.set([c, s, 0, -s, c, 0, 0, 0, 1, x, y, 0]); trs(this.nodes, this.W, this.root); }
    alive() { return this.set.sys.some((s) => s.n || s.on); }
    dispose() { this.set.dispose(); }
  }
  // fire: def = rig data.shots[clip]; from / to in field units; k = the rig's scale, dir = facing
  function shot(sd, def, from, to, field, k, dir, order) {
    const tex = sd.tpl.atlas.tex, rects = sd.tpl.atlas.rects;
    const g = new THREE.Group();
    g.position.set(from[0], from[1], 0); g.scale.set(k * dir, k, 1);
    field.add(g);
    const lx = (to[0] - from[0]) / (k * dir), ly = (to[1] - from[1]) / k;
    const b = new Loose(def.b, tex, rects, g, order);
    const e = { g, b, hit: null, t: 0, T: def.T, def, lx, ly, tex, rects, order, done: false };
    e.ang = Math.atan2(ly, lx);
    b.place(0, 0, e.ang);
    live.push(e);
    return e;
  }
  function pathAt(e, u) {
    if (e.def.laser) return [0, 0]; // a beam stays at the muzzle
    const c = e.def.curve && e.def.curve.length ? curve(e.def.curve, u) : u;
    const lift = e.def.type === 1 ? 0.25 : e.def.type >= 2 ? 0.5 : 0; // curve / howitzer: an arc over the line
    const d = Math.hypot(e.lx, e.ly);
    return [e.lx * c, e.ly * c + lift * d * 4 * c * (1 - c)];
  }
  function tick(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      e.t += dt;
      if (!e.done) {
        const u = Math.min(1, e.t / e.T), p = pathAt(e, u), q = pathAt(e, Math.min(1, u + 0.02));
        const ang = u < 0.99 ? Math.atan2(q[1] - p[1], q[0] - p[0]) : e.ang;
        e.b.place(p[0], p[1], ang);
        if (u >= 1) {
          e.done = true;
          e.b.EA.fill(0); // the projectile is removed on arrival (Unity destroys it), its hit effect plays
          if (e.def.laser) e.b.EA.fill(1); // the beam keeps showing while its hit plays
          if (e.def.hit && e.def.hit.length) {
            e.hit = new Loose(e.def.hit, e.tex, e.rects, e.g, e.order + 1);
            const hs = e.def.hs || 1;
            e.hit.place(e.lx, e.ly, 0);
            if (hs !== 1) for (let n = 0; n < e.hit.W.length; n += 12) for (let c = 0; c < 9; c++) e.hit.W[n + c] *= hs;
          }
        }
      }
      e.b.set.update(dt);
      if (e.hit) e.hit.set.update(dt);
      if (e.done && !e.b.alive() && (!e.hit || (!e.hit.alive() && e.t > e.T + 0.2)) || e.t > e.T + 6) {
        e.b.dispose(); if (e.hit) e.hit.dispose(); e.g.parent && e.g.parent.remove(e.g); live.splice(i, 1);
      }
    }
  }
  // a hit effect played once on the target (the clip's EventHit effect, for hits without a projectile)
  function burst(sd, tree, at, field, k, dir, order) {
    const g = new THREE.Group();
    g.position.set(at[0], at[1], 0); g.scale.set(k * dir, k, 1);
    field.add(g);
    const b = new Loose(tree, sd.tpl.atlas.tex, sd.tpl.atlas.rects, g, order);
    b.place(0, 0, 0);
    live.push({ g, b, hit: null, t: 0, T: 0, def: {}, done: true });
  }
  function clearAll() { for (const e of live) { e.b.dispose(); if (e.hit) e.hit.dispose(); e.g.parent && e.g.parent.remove(e.g); } live.length = 0; }

  window.SDPS = {
    trailBake: (on) => { TRAIL_AGE = !on; TRAIL_HOLD = on ? 0.09 : 0; }, // shown from the bake frame at 0.1 s
    geoView: (on) => { GEO_VIEW = !!on; },
    meshK: (k) => { if (k != null) MESH_K = k; return MESH_K; },
    has: (tpl) => tpl.data.nodes.some((n) => n.ps || n.tr),
    create: (sd) => new Set(sd),
    shot, burst, tick, clear: clearAll,
    // tools: a node tree played on its own (tools/build_compare.py side-by-side check against the Unity bake)
    loose: (tree, tex, rects, parent, order, viewH) => { const l = new Loose(tree, tex, rects, parent, order || 0); if (viewH) l.set.src.viewH = () => viewH; return l; },
    viewH: 0, // the game's view height in field units (js/game.js view())
  };
})();
