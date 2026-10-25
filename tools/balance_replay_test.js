(async function () {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || !new URLSearchParams(location.search).has('unlock')) return;
  const box = document.createElement('pre'); box.id = 'balance-replay-report';
  box.style.cssText = 'position:fixed;inset:0;z-index:999;background:#123;color:white;overflow:auto;padding:16px';
  document.body.appendChild(box);
  const rows = [];
  try {
    const play = async (st, seed) => {
      let state = seed;
      const original = Math.random;
      Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
      try {
        const ids = ['brownie', 'leprechaun', 'gnome', 'amy', 'valkyrie', 'andvari', 'phoenix', 'thetis', 'hraesvelgr', 'undine'];
        return await BAL.battle({ ...st, finale: false }, ids.map(id => ({ id, lv: DATA.relLv(DATA.UNIT[id].rank, 10) })), { seed });
      } finally { Math.random = original; }
    };
    for (const code of ['H4-2', 'H7-5', 'H8-4']) {
      const st = DATA.HARD.find(stage => stage.code === code);
      const a = await play(st, 71), b = await play(st, 71);
      const pass = JSON.stringify(a) === JSON.stringify(b);
      rows.push({ code, pass, time: a.t, base: a.base, ...(pass ? {} : { a, b }) });
      if (!pass) throw Error('같은 난수에서 전투 결과가 달라짐: ' + code);
    }
    box.textContent = JSON.stringify({ done: true, rows });
  } catch (error) { box.textContent = JSON.stringify({ done: false, rows, error: String(error.stack || error) }); }
})();
