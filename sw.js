// Offline / repeat-visit cache. Heavy data (rigs, baked effects, sounds, illustrations) is cache-first: it only changes
// when the build tools run, and then CACHE is bumped. Code and pages are network-first so edits show up at once.
const CACHE = 'lao-war-genesis-3e71c31fee';
const HEAVY = /\/(js\/sd|js\/fx|assets)\//;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (HEAVY.test(req.url)) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => { // revalidate: never a heuristically cached old script
    if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
    return res;
  }).catch(() => caches.match(req)));
});
