// Sound: effects through WebAudio (decoded once, low latency, many voices), streamed BGM, and character lines.
// Volumes are the player's settings (0..1) x a base mix, kept in localStorage.
(function () {
  const BASE = { sfx: 0.6, bgm: 0.55, voice: 1.0 }; // the files are loudness-levelled (tools/build_assets.py): BGM sits below effects and lines
  const SET = { sfx: 1, bgm: 1, voice: 1 };
  try { Object.assign(SET, JSON.parse(localStorage.getItem('lao_war_genesis_audio') || '{}')); } catch (e) { /* defaults */ }
  const VOL = { get sfx() { return BASE.sfx * SET.sfx; }, get bgm() { return BASE.bgm * SET.bgm; }, get voice() { return BASE.voice * SET.voice; } };

  let ctx = null, sfxGain = null, unlocked = false;
  const buffers = {}, loading = {}, last = {}, live = {};
  const MAX_LIVE = 6; // copies of one sound at once

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = VOL.sfx;
    sfxGain.connect(ctx.destination);
    return ctx;
  }
  function load(key) {
    const src = window.SND && SND[key];
    if (!src || !ensureCtx()) return Promise.resolve(null);
    if (buffers[key]) return Promise.resolve(buffers[key]);
    if (!loading[key]) {
      loading[key] = fetch(src).then((r) => r.arrayBuffer())
        .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
        .then((buf) => { buffers[key] = buf; return buf; })
        .catch(() => null);
    }
    return loading[key];
  }
  // file:// (fetch is blocked there): plain audio elements
  const pools = {};
  function playElement(key, vol) {
    const pool = pools[key] || (pools[key] = []);
    let a = pool.find((x) => x.paused || x.ended);
    if (!a) { if (pool.length >= 4) return; a = new Audio(SND[key]); pool.push(a); }
    a.volume = Math.min(1, VOL.sfx * vol);
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  function play(key, vol = 1) {
    if (!unlocked || !window.SND || !SND[key]) return;
    const now = performance.now();
    if (now - (last[key] || 0) < 40) return; // one volley on one frame plays once
    last[key] = now;
    if (location.protocol === 'file:') return playElement(key, vol);
    const buf = buffers[key];
    if (!buf) { load(key).then((b) => { if (b && performance.now() - now < 150) play(key, vol); }); last[key] = 0; return; }
    if ((live[key] || 0) >= MAX_LIVE) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = Math.min(1.5, vol);
    src.connect(g).connect(sfxGain);
    live[key] = (live[key] || 0) + 1;
    src.onended = () => { live[key]--; };
    src.start();
  }
  // decode a set of effects ahead of a battle
  function preload(keys) { if (location.protocol !== 'file:' && unlocked) keys.forEach(load); }

  let bgm = null, bgmKey = '';
  function music(key) {
    if (bgmKey === key) return;
    bgmKey = key;
    if (bgm) { const old = bgm; fade(old, 0, 400, () => old.pause()); bgm = null; }
    const src = key && window.BGM && BGM[key];
    if (!src) return;
    bgm = new Audio(src);
    bgm.loop = key !== 'defeat';
    bgm.volume = 0;
    if (unlocked) bgm.play().catch(() => {});
    fade(bgm, VOL.bgm, 600);
  }
  function fade(el, to, ms, done) {
    const from = el.volume, t0 = performance.now();
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * u));
      if (u < 1) setTimeout(step, 30); else if (done) done();
    };
    step();
  }

  // character lines (gacha / joining / battle barks): one at a time; barks never cut a line in progress
  let voiceEl = null, voiceAt = 0;
  function voice(src, bark) {
    if (!src || !unlocked) return;
    const now = performance.now();
    if (bark && voiceEl && !voiceEl.ended && !voiceEl.paused) return;
    if (bark && now - voiceAt < 6000) return; // barks stay occasional
    if (voiceEl) voiceEl.pause();
    voiceEl = new Audio(src);
    voiceEl.volume = VOL.voice;
    voiceEl.play().catch(() => {});
    voiceAt = now;
    // the music ducks under a line
    if (bgm) { bgm.volume = VOL.bgm * 0.45; const el = voiceEl; el.onended = el.onpause = () => { if (bgm && voiceEl === el) fade(bgm, VOL.bgm, 500); }; }
  }

  function setVolume(kind, v) {
    SET[kind] = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('lao_war_genesis_audio', JSON.stringify(SET)); } catch (e) { /* private mode */ }
    if (kind === 'bgm' && bgm) bgm.volume = VOL.bgm;
    if (kind === 'sfx' && sfxGain) sfxGain.gain.value = VOL.sfx;
  }

  // browsers start audio only after a user gesture
  const unlock = () => {
    if (ensureCtx() && ctx.state === 'suspended') ctx.resume();
    if (unlocked) return;
    unlocked = true;
    if (bgm) bgm.play().catch(() => {});
    preload(['click', 'deploy', 'rifle', 'mg', 'cannon', 'swing', 'expS', 'expB', 'levelup', 'genA', 'genS', 'genSS', 'pickSS', 'charge', 'warning']);
  };
  addEventListener('pointerdown', unlock, { capture: true });
  addEventListener('keydown', unlock, { capture: true });

  window.AUDIO = { play, music, voice, setVolume, preload, volume: (k) => SET[k] };
})();
