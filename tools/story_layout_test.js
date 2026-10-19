// Exercise the actual dialogue renderer at the browser's current viewport.
// ?unlock=1&storyqa=1 — run at desktop, 390x844, 320x568 and landscape widths.
(async function () {
  const panel = document.createElement('pre');
  panel.id = 'storyQa';
  panel.style.cssText = 'position:fixed;z-index:100;top:8px;left:8px;max-width:90vw;max-height:25vh;overflow:auto;background:#07120feb;color:#bfffd5;padding:10px;font:12px monospace;white-space:pre-wrap';
  document.body.appendChild(panel);
  const failures = [];
  const heights = new Set();
  let lines = 0;
  try {
    await document.fonts.ready;
    const box = document.getElementById('stBox'), text = document.getElementById('stText');
    for (const [key, scene] of Object.entries(STORY.S)) {
      APP.playStory(key);
      for (let i = 0; i < scene.lines.length; i++) {
        box.click(); // finish the currently typing line
        const b = box.getBoundingClientRect(), t = text.getBoundingClientRect();
        heights.add(Math.round(b.height));
        if (text.textContent !== scene.lines[i][1]) failures.push(`${key}:${i} dialogue mismatch`);
        const speaker = document.getElementById('stName');
        const n = speaker.getBoundingClientRect();
        if (speaker.textContent && (n.left < 0 || n.right > innerWidth + 1 || speaker.scrollHeight > speaker.clientHeight + 1))
          failures.push(`${key}:${i} speaker caption outside viewport or wrapping`);
        if (scene.lines[i][3]?.channel === 'radio' && (!speaker.textContent.endsWith(' · 통신') || !text.classList.contains('radio')))
          failures.push(`${key}:${i} remote speech not identified`);
        if (t.left < b.left || t.right > b.right + 1 || t.bottom > b.bottom - 10 || t.top < b.top + 8)
          failures.push(`${key}:${i} text outside dialogue frame (${Math.round(t.height)}px)`);
        if (b.left < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1 || b.top < 0)
          failures.push(`${key}:${i} dialogue frame outside viewport`);
        lines++;
        if (i + 1 < scene.lines.length) box.click(); // advance, never finish the scene or trigger a battle
      }
    }
    if (heights.size !== 1) failures.push('Dialogue frame changes height: ' + [...heights].join(', '));
    for (const src of Object.values(STORY.ART || {})) {
      const image = new Image(); image.src = src;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) failures.push('empty art ' + src);
    }
    // Exercise the exact stylesheet cascade with the reduced-motion rules enabled,
    // without changing the user's OS/browser preference. This catches specificity regressions.
    const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(el => el.href.includes('/css/ui.css'));
    const reduced = document.createElement('style');
    reduced.textContent = (await (await fetch(link.href, { cache: 'no-store' })).text()).replace(/\(prefers-reduced-motion:\s*reduce\)/g, '(min-width: 0px)');
    try {
      document.head.appendChild(reduced);
      const scene = STORY.S.c8_outro, cue = scene.lines.findIndex(line => line[3]?.art === 'underground');
      APP.playStory('c8_outro');
      for (let i = 0; i < cue; i++) { box.click(); box.click(); }
      if (getComputedStyle(document.getElementById('stBg')).animationName !== 'none') failures.push('reduced-motion cascade still animates ending');
      APP.playStory('c1_intro'); box.click(); box.click();
      if (getComputedStyle(document.getElementById('stL')).animationName !== 'none') failures.push('reduced-motion cascade still animates speaker');
    } finally { reduced.remove(); }
    document.getElementById('stSkip').click();
    panel.textContent = `${failures.length ? 'FAIL' : 'PASS'} STORY LAYOUT ${innerWidth}x${innerHeight}\n${Object.keys(STORY.S).length} scenes / ${lines} lines / fixed ${[...heights].join(',')}px frame\n` + (failures.join('\n') || 'All text fits; scene transitions complete; story art decodes.');
    window.STORY_QA = { failures, lines, scenes: Object.keys(STORY.S).length, width: innerWidth, height: innerHeight };
  } catch (error) {
    panel.textContent = 'FAIL STORY LAYOUT\n' + String(error.stack || error);
  }
})();
