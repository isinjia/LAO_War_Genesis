// Packed images (the Cloudflare build only, window.PACK): tools/build_dist.mjs ships the images scrambled, so the
// browser's dev tools show data, not pictures; they are restored here in memory as blob: URLs. Without PACK (local
// development, file://) everything passes straight through. A deterrent against casual copying, not a lock.
(function () {
  const on = !!window.PACK;
  const K = Array.from('LAO-war-genesis', (c) => c.charCodeAt(0));
  // the same byte mask as tools/build_dist.mjs (it is its own inverse)
  function unmask(u8) {
    for (let i = 0; i < u8.length; i++) u8[i] ^= K[i % K.length] ^ ((i * 131 + 7) & 255);
    return u8;
  }
  function fromB64(s) {
    const bin = atob(s), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  // "pk:<mime>:<masked base64>" (embedded images) -> blob: URL
  const PK = /^pk:([\w.+/-]+):([A-Za-z0-9+/=]+)$/;
  function fromPk(str) {
    const m = PK.exec(str);
    return m ? URL.createObjectURL(new Blob([unmask(fromB64(m[2]))], { type: m[1] })) : str;
  }
  // a packed file: <url>.pak -> blob: URL (the caller may revoke it once the image is decoded)
  async function url(u, mime) {
    if (!on || !u || /^(data|blob):/.test(u)) return u;
    const r = await fetch(u + '.pak');
    if (!r.ok) throw new Error('pack ' + r.status + ' ' + u);
    return URL.createObjectURL(new Blob([unmask(new Uint8Array(await r.arrayBuffer()))], { type: mime || 'image/webp' }));
  }
  // a packed file straight to pixels: <url>.pak -> ImageBitmap, with no URL at all (a blob: URL would be listed, and
  // previewed as a picture, by the browser's dev tools). null where createImageBitmap is missing (then use url()).
  async function bitmap(u) {
    if (!on || !window.createImageBitmap) return null;
    const r = await fetch(u + '.pak');
    if (!r.ok) throw new Error('pack ' + r.status + ' ' + u);
    return createImageBitmap(new Blob([unmask(new Uint8Array(await r.arrayBuffer()))], { type: 'image/webp' }));
  }
  // pixels into a canvas (a texture source that keeps three.js' flipY), scaled by k
  function toCanvas(bm, k) {
    const c = document.createElement('canvas');
    c.width = Math.max(4, Math.round(bm.width * k)); c.height = Math.max(4, Math.round(bm.height * k));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bm, 0, 0, c.width, c.height);
    if (bm.close) bm.close();
    return c;
  }
  // the embedded image tables (js/assets.js: IMG; js/ui_assets.js: UIA ... .u), restored in place, once
  function globals() {
    if (!on) return;
    if (window.IMG) for (const k in IMG) if (typeof IMG[k] === 'string' && IMG[k].startsWith('pk:')) IMG[k] = fromPk(IMG[k]);
    const walk = (o, d) => {
      if (!o || typeof o !== 'object' || d > 4) return;
      if (typeof o.u === 'string' && o.u.startsWith('pk:')) o.u = fromPk(o.u);
      for (const k in o) if (o[k] && typeof o[k] === 'object') walk(o[k], d + 1);
    };
    walk(window.UIA, 0);
  }
  // CSS text with url(pk:...) sprites (js/ui_assets.js style sheet)
  function css(text) {
    return on ? text.replace(/pk:[\w.+/-]+:[A-Za-z0-9+/=]+/g, fromPk) : text;
  }
  // ── picture files (illustrations, expressions, story art: assets/full|face|story/*.webp) ──
  // shipped as <file>.webp.pak; restored once per file as a blob: URL and swapped into the tables that name them
  // (FULL, FACES, STORY.ART), so the code keeps using plain URLs. An <img> that asks for a file before it is ready
  // fails, and is given the restored picture as soon as it is (the capturing 'error' listener below).
  const FILE = /(^|\/)assets\/(full|face|story)\/[^?#]+\.webp$/;
  const pics = {};
  function swap(path, blob) {
    if (window.FULL) for (const k in FULL) if (FULL[k] === path) FULL[k] = blob;
    if (window.FACES) for (const k in FACES) { const e = FACES[k].e || {}; for (const x in e) if (e[x] === path) e[x] = blob; }
    if (window.STORY && STORY.ART) for (const k in STORY.ART) if (STORY.ART[k] === path) STORY.ART[k] = blob;
  }
  function pic(u) {
    if (!on || typeof u !== 'string' || !FILE.test(u)) return Promise.resolve(u);
    if (!pics[u]) {
      pics[u] = url(u, 'image/webp').then((b) => { swap(u, b); return b; }, () => { delete pics[u]; return u; });
    }
    return pics[u];
  }
  if (on) {
    document.addEventListener('error', (e) => {
      const el = e.target, src = el && el.tagName === 'IMG' && el.getAttribute('src');
      if (src && FILE.test(src)) pic(src).then((b) => { if (b !== src && el.getAttribute('src') === src) el.src = b; });
    }, true);
    // every picture file restored in the background after the page is up, a few at a time (cached by the worker)
    addEventListener('load', () => setTimeout(() => {
      const all = new Set();
      if (window.FULL) for (const k in FULL) all.add(FULL[k]);
      if (window.STORY && STORY.ART) for (const k in STORY.ART) all.add(STORY.ART[k]);
      if (window.FACES) for (const k in FACES) for (const x in (FACES[k].e || {})) all.add(FACES[k].e[x]);
      const list = [...all].filter((u) => FILE.test(u));
      const next = () => { const u = list.shift(); if (u) pic(u).then(next); };
      for (let i = 0; i < 3; i++) next();
    }, 1500));
  }
  window.PACKED = { on, url, bitmap, toCanvas, globals, css, unmask, pic };
})();
