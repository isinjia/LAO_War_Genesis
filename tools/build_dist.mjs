// Builds dist/ for the Cloudflare deploy (wrangler.jsonc runs it before every deploy, on Cloudflare's build machine).
// Only the game files go out, and the game's own scripts are minified and mangled (comments gone, local names
// shortened) so the served code is hard to read. The repository and local files keep the readable source.
//   node tools/build_dist.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');

// terser: installed on the fly when the build machine does not have it yet (no package.json needed)
async function loadTerser() {
  try { return await import('terser'); } catch (e) { /* not installed */ }
  execSync('npm install --no-save --no-audit --no-fund terser@5.31.0', { cwd: ROOT, stdio: 'inherit' });
  return import(pathToFileURL(path.join(ROOT, 'node_modules', 'terser', 'main.js')).href);
}

// what ships: the page, the service worker, the manifest and these folders
const FILES = ['index.html', 'sw.js'];
const DIRS = ['css', 'js', 'assets'];
// generated data (assets, translations, effect / rig tables) and the already-minified three.js stay as they are
const SKIP_MINIFY = /^js\/(assets|ui_assets|faces|story|anim_events)\.js$|^js\/(vendor|fx|sd)\//;

const OPTS = {
  ecma: 2020,
  compress: { passes: 2 },
  mangle: true, // local names only: globals (GAME, UI, DATA...) and property names are kept, so nothing breaks
  format: { comments: false },
};

function copyTree(rel) {
  const src = path.join(ROOT, rel), dst = path.join(OUT, rel);
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) copyTree(path.posix.join(rel, f));
  } else fs.copyFileSync(src, dst);
}

// ── packed images (js/pack.js restores them): the same self-inverse byte mask on both sides ──
const K = Array.from('LAO-war-genesis', (c) => c.charCodeAt(0));
function mask(buf) {
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) u8[i] ^= K[i % K.length] ^ ((i * 131 + 7) & 255);
  return u8;
}
// data:<mime>;base64,<b64>  ->  pk:<mime>:<masked b64>
const DATA_URI = /data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)/g;
const pk = (text) => text.replace(DATA_URI, (m, mime, b64) => 'pk:' + mime + ':' + Buffer.from(mask(Buffer.from(b64, 'base64'))).toString('base64'));

function packAssets() {
  const sd = path.join(OUT, 'js/sd'), fx = path.join(OUT, 'js/fx');
  let files = 0, dropped = 0;
  // file:// copies (the same atlases / sheets as base64 inside scripts): never needed over http, and they would
  // hand the pictures out unmasked
  for (const f of fs.readdirSync(sd)) if (/\.a\d+\.js$/.test(f)) { fs.rmSync(path.join(sd, f)); dropped++; }
  for (const f of fs.readdirSync(fx)) {
    const m = /^(.+)\.js$/.exec(f);
    if (m && !f.endsWith('.m.js') && f !== '_meta.js' && fs.existsSync(path.join(fx, m[1] + '.m.js'))) { fs.rmSync(path.join(fx, f)); dropped++; }
  }
  // atlases and effect sheets: <file>.webp -> <file>.webp.pak (masked bytes)
  for (const dir of [sd, fx]) for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.webp')) continue;
    const p = path.join(dir, f);
    fs.writeFileSync(p + '.pak', mask(fs.readFileSync(p)));
    fs.rmSync(p);
    files++;
  }
  // illustrations, expressions and story art: <file>.webp -> <file>.webp.pak (js/pack.js PACKED.pic restores them)
  for (const sub of ['full', 'face', 'story']) {
    const dir = path.join(OUT, 'assets', sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.webp')) continue;
      const p = path.join(dir, f);
      fs.writeFileSync(p + '.pak', mask(fs.readFileSync(p)));
      fs.rmSync(p);
      files++;
    }
  }
  // embedded images: IMG (js/assets.js), UIA .u and the UI sprite style sheet (js/ui_assets.js)
  const assets = path.join(OUT, 'js/assets.js');
  fs.writeFileSync(assets, pk(fs.readFileSync(assets, 'utf8')) + '\n;window.PACKED&&PACKED.globals();\n');
  const ui = path.join(OUT, 'js/ui_assets.js');
  fs.writeFileSync(ui, pk(fs.readFileSync(ui, 'utf8')) +
    "\n;(function(){if(!window.PACKED)return;PACKED.globals();var s=document.getElementById('ui-assets');if(s)s.textContent=PACKED.css(s.textContent);})();\n");
  // switch the restore on (an inline script runs before every deferred one)
  const htmlFile = path.join(OUT, 'index.html');
  fs.writeFileSync(htmlFile, fs.readFileSync(htmlFile, 'utf8').replace('<head>', '<head>\n<script>window.PACK=1</script>'));
  console.log(`packed: ${files} image files masked, ${dropped} file:// copies dropped, embedded images masked`);
}

async function main() {
  const { minify } = await loadTerser();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of FILES) copyTree(f);
  for (const d of DIRS) copyTree(d);
  packAssets();

  // minify the game's own scripts
  const scripts = ['sw.js', ...fs.readdirSync(path.join(OUT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)]
    .filter((f) => !SKIP_MINIFY.test(f));
  let before = 0, after = 0;
  for (const rel of scripts) {
    const file = path.join(OUT, rel), code = fs.readFileSync(file, 'utf8');
    const out = await minify(code, OPTS);
    if (out.code == null) throw new Error('terser failed on ' + rel);
    fs.writeFileSync(file, out.code);
    before += code.length; after += out.code.length;
  }
  // the page's inline scripts too, and its HTML comments
  const htmlFile = path.join(OUT, 'index.html');
  let html = fs.readFileSync(htmlFile, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  for (const m of inline) {
    const out = await minify(m[1], OPTS);
    if (out.code == null) throw new Error('terser failed on an inline script');
    html = html.replace(m[0], () => '<script>' + out.code + '</script>'); // a function: "$" in the code stays literal
  }
  fs.writeFileSync(htmlFile, html);
  console.log(`dist: ${scripts.length} scripts + ${inline.length} inline minified (${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
