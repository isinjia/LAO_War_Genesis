// Speech fidelity report: each story speaker's lines (js/story.js) against the original's lobby / join lines
// (7_LAO_3Kingdom js/lines_data.js + tools/lao_data.json). Run: node tools/speech_score.js [--json] [id ...]
// Per character, out of 100:
//   address 30   — the words they call the commander by are the original's (a term the original never uses costs)
//   register 40  — the share of sentence endings: military (-슴다/말입니다) / formal (-니다) / polite (-요) /
//                  archaic (-노라/-구나) / plain, compared with the original (1 - total variation distance)
//   self 15      — the first person they use (저 / 나 / 이몸 / their own name) matches the original's
//   habit 15     — the original's own laughs / interjections / sentence endings (rare elsewhere) show up in the story
// The score checks the voice, not the writing: it says nothing about plot, humour or whether a line is good.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const SRC = 'E:/LAO_MINI_GAME/7_LAO_3Kingdom';

const ctx = vm.createContext({ window: {} });
for (const n of ['data', 'story']) vm.runInContext(fs.readFileSync(path.join(root, 'js', n + '.js'), 'utf8'), ctx);
const { S } = ctx.window.STORY;
const roster = fs.readFileSync(path.join(root, 'tools', 'roster.py'), 'utf8');
const MODEL = Object.fromEntries([...roster.matchAll(/"(\w+)": "(\w+?)(?:_N)?"/g)].map((m) => [m[1], m[2]]));

// original lines: lobby lines plus join / greeting lines where present
const lt = fs.readFileSync(path.join(SRC, 'js', 'lines_data.js'), 'utf8');
const LINES = JSON.parse(lt.slice(lt.indexOf('{'), lt.lastIndexOf('}') + 1));
const orig = {};
for (const [k, arr] of Object.entries(LINES)) orig[k] = arr.map((x) => x.t);
try {
  const extra = JSON.parse(fs.readFileSync(path.join(SRC, 'tools', 'lao_data.json'), 'utf8'));
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    const key = o.model || o.key || o.id;
    for (const f of ['join', 'greet', 'lines', 'talk']) {
      const v = o[f];
      if (key && typeof key === 'string') {
        const k = key.replace(/_N$/, '');
        if (typeof v === 'string' && v.trim()) (orig[k] = orig[k] || []).push(v);
        if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && (orig[k] = orig[k] || []).push(x));
      }
    }
    Object.values(o).forEach(walk);
  };
  walk(extra);
} catch (e) { /* optional */ }

const ADDRESS = ['사령관님', '사령관', '주인님', '각하', '지휘관', '인간님', '구원자님', '구원자', '용사님', '주공', '오빠', '오라버니',
  '대장', '선생님', '폐하', '용살자', '그대', '당신'];
// a whole word only (생각하다 is not 각하, 그대로 is not 그대): no hangul right before it
const ADDR_RE = ADDRESS.map((a) => [a, new RegExp('(^|[^가-힣])' + a + (a === '그대' ? '(?!로)' : ''), 'g')]);
const addrOf = (t) => { const out = new Set(); let s = t; for (const [a, re] of ADDR_RE) if (re.test(s)) { out.add(a); s = s.replace(re, '$1 '); } return out; };
const SELF = [['polite', /(^|[\s"(…])(저는|제가|저도|저를|저의|제|저한테|저에게|저야말로)(?=[\s,.!?…~]|$)/],
  ['plain', /(^|[\s"(…])(나는|내가|나도|나를|나의|난|날|내|나한테|나랑)(?=[\s,.!?…~]|$)/],
  ['archaic', /(이몸|본인|짐이|짐은|소녀)/]];
const selfOf = (t) => SELF.filter(([, re]) => re.test(t)).map(([k]) => k);
// sentence endings
function endings(t) {
  return t.replace(/\([^)]*\)|\*[^*]*\*/g, ' ').split(/(?<=[.!?…~♪♡])\s*|\n/).map((x) => x.replace(/[.!?…~♪♡,'"“”‘’\s]+$/g, '').trim()).filter((x) => /[가-힣]$/.test(x));
}
function regOf(e) {
  e = e.replace(/(니다|니까)(만|만은|요)$/, '$1'); // 별다른 내용은 없습니다만 / 그렇습니다요: still the formal register
  if (/(슴다|슴까|말입니다|검까|겠슴|임다|함다|됨다|슴니까)$/.test(e)) return 'mil';
  if (/(니다|니까|십시오|십시요|옵니다|사옵|나이다)$/.test(e)) return 'formal';
  if (/(요|죠)$/.test(e)) return 'polite'; // -죠 is -지요
  if (/(노라|느냐|구나|거라|로다|도다|하오|구려|더냐|리라|니라|느니라|도록 하라|하라|이로다|겠느냐|인가|이니)$/.test(e)) return 'archaic';
  return 'plain';
}
const REGS = ['mil', 'formal', 'polite', 'archaic', 'plain'];
const dist = (lines) => { const c = Object.fromEntries(REGS.map((r) => [r, 0])); let n = 0; for (const t of lines) for (const e of endings(t)) { c[regOf(e)]++; n++; } return { c, n }; };
// verbal habits: laughs / interjections and sentence endings that are frequent in this character's original lines and
// rare in everyone else's (topic words like a favourite food are not a voice)
const LAUGH = /^(후+후*|흐+흥*|킥+|헤+|에헤+|오호+|아하+|훗|흥|우후+|히히+|하하+|후훗|크크+|에헷|에헤헤|으음|음+|흠+|어머|아앗|앗|헤에|우우|으으|칫|쳇|흐응)/;
const tics = (t) => {
  const out = [];
  for (const w of (t.match(/[가-힣]+/g) || [])) if (LAUGH.test(w) && w.length <= 5) out.push('~' + w.replace(/(.)+/g, '$1$1'));
  for (const e of endings(t)) { const m = e.match(/[가-힣]{2,4}$/); if (m) out.push('$' + m[0].slice(-3)); }
  return out;
};
const df = {};
for (const arr of Object.values(orig)) { const seen = new Set(arr.flatMap(tics)); for (const w of seen) df[w] = (df[w] || 0) + 1; }
const NCH = Object.keys(orig).length;
function habits(arr) {
  const tf = {};
  for (const t of arr) for (const w of new Set(tics(t))) tf[w] = (tf[w] || 0) + 1;
  return Object.entries(tf).filter(([w, n]) => n >= 2 && df[w] <= NCH * 0.12)
    .map(([w, n]) => [w, n * Math.log(NCH / (df[w] || 1))]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
}
const hasTic = (lines, w) => lines.some((t) => tics(t).includes(w));
// concept: the character's own subjects in the original (a word stem frequent for them, rare for the rest: Gnome's
// concrete, Constantia's tea, Raven's 'little ones'); reported next to the voice score
const stem = (w) => w.replace(/(을|를|이|가|은|는|의|에|에서|으로|로|도|만|과|와|랑|이랑|한테|께|요|이에요|예요|입니다|이다)$/, '');
const words = (t) => (t.match(/[가-힣]{2,}/g) || []).map(stem).filter((w) => w.length >= 2);
const wdf = {};
for (const arr of Object.values(orig)) { const seen = new Set(arr.flatMap(words)); for (const w of seen) wdf[w] = (wdf[w] || 0) + 1; }
const STOP = new Set(['사령관', '사령관님', '주인님', '각하', '그렇게', '정말', '조금', '오늘', '지금', '그럼', '이제', '다시', '혹시', '그래도', '그리고', '하지만', '그런', '이렇게', '우리', '저는', '제가', '나는', '내가', '있어', '없어', '해요', '하는', '있는', '같은', '말씀', '생각', '그냥', '모두', '다른', '이런', '그건', '이건', '저도', '나도']);
function concepts(arr) {
  const tf = {};
  for (const t of arr) for (const w of new Set(words(t))) tf[w] = (tf[w] || 0) + 1;
  return Object.entries(tf).filter(([w]) => !STOP.has(w) && wdf[w] <= Math.max(2, NCH * 0.02)).map(([w, n]) => [w, n * Math.log(NCH / wdf[w])])
    .sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w);
}

// story lines per speaker
const story = {};
for (const sc of Object.values(S)) for (const [who, text] of sc.lines) if (MODEL[who]) (story[who] = story[who] || []).push(text);

function score(id) {
  const key = MODEL[id], o = orig[key], st = story[id];
  if (!o || !o.length || !st) return null;
  // address
  const oa = new Set(o.flatMap((t) => [...addrOf(t)])), sa = st.flatMap((t) => [...addrOf(t)]);
  const foreign = sa.filter((a) => !oa.has(a) && !(a === '사령관' && oa.has('사령관님')) && !(a === '사령관님' && oa.has('사령관')));
  const address = sa.length ? 30 * (1 - foreign.length / sa.length) : 30;
  // register
  const od = dist(o), sd = dist(st);
  const tv = REGS.reduce((a, r) => a + Math.abs(od.c[r] / (od.n || 1) - sd.c[r] / (sd.n || 1)), 0) / 2;
  const register = 40 * (1 - tv);
  // first person
  const os = new Set(o.flatMap(selfOf)), ss = st.flatMap(selfOf);
  const selfBad = ss.filter((k) => os.size && !os.has(k));
  const self = ss.length ? 15 * (1 - selfBad.length / ss.length) : 15;
  // habits
  const hw = habits(o), found = hw.filter((w) => hasTic(st, w));
  const habit = hw.length ? 15 * Math.min(1, found.length / Math.min(2, hw.length)) : 15; // two of them (or the only one)
  const total = Math.round(address + register + self + habit);
  const cw = concepts(o), cfound = cw.filter((w) => st.some((t) => t.includes(w)));
  return { concept: cfound.length ? 1 : 0, cwords: cw.slice(0, 8).join('/'), cfound: cfound.join('/'), id, key, lines: st.length, total, address: Math.round(address), register: Math.round(register), self: Math.round(self), habit: Math.round(habit),
    origReg: REGS.map((r) => r + ':' + Math.round(100 * od.c[r] / (od.n || 1))).join(' '), storyReg: REGS.map((r) => r + ':' + Math.round(100 * sd.c[r] / (sd.n || 1))).join(' '),
    origAddr: [...oa].join('/'), foreign: [...new Set(foreign)].join('/'), origSelf: [...os].join('/'), selfBad: [...new Set(selfBad)].join('/'), habits: hw.slice(0, 6).join('/'), found: found.join('/') };
}

const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const rows = Object.keys(story).filter((id) => !want.length || want.includes(id)).map(score).filter(Boolean).sort((a, b) => a.total - b.total);
const missing = Object.keys(story).filter((id) => !orig[MODEL[id]]);
const weighted = rows.reduce((a, r) => a + r.total * r.lines, 0) / rows.reduce((a, r) => a + r.lines, 0);
if (process.argv.includes('--json')) { console.log(JSON.stringify({ overall: weighted, rows, missing }, null, 1)); process.exit(0); }
for (const r of rows) {
  console.log(`${String(r.total).padStart(3)} ${r.id.padEnd(16)} n${String(r.lines).padStart(3)}  addr ${r.address} reg ${r.register} self ${r.self} habit ${r.habit}`);
  if (r.total < 90) console.log(`      orig ${r.origReg} | story ${r.storyReg}\n      addr ${r.origAddr || '-'}${r.foreign ? ' (story also: ' + r.foreign + ')' : ''} · self ${r.origSelf || '-'}${r.selfBad ? ' (story: ' + r.selfBad + ')' : ''} · habits ${r.habits} → ${r.found || 'none'}`);
}
const noConcept = rows.filter((r) => !r.concept);
console.log(`\nconcept: ${rows.length - noConcept.length}/${rows.length} use at least one of their original subjects` + (noConcept.length ? ' — missing: ' + noConcept.map((r) => `${r.id} (${r.cwords})`).join('; ') : ''));
console.log(`overall (line-weighted) ${weighted.toFixed(1)} · lowest ${rows[0] && rows[0].total} · characters ${rows.length}` + (missing.length ? ` · no original lines: ${missing.join(', ')}` : ''));
