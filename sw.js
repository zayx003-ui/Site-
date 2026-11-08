// Service worker : met en cache UNIQUEMENT la coque statique du site (HTML, CSS, JS, icônes).
// Jamais les notes (Google Sheets) ni l'emploi du temps (ADECal.ics) : ce sont des données personnelles.
const VERSION = 'bio-campus-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'offline.html', 'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/calendar.js', 'js/charts.js', 'js/coefficients.js', 'js/components.js', 'js/config.js', 'js/dashboard.js', 'js/data.js', 'js/dom.js',
  'js/exports.js', 'js/grades.js', 'js/math.js', 'js/model.js', 'js/search.js', 'js/settings.js', 'js/simulator.js', 'js/state.js', 'js/statistics.js', 'js/util.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;       // tout le reste (Google, polices) : réseau direct
  if (url.pathname.endsWith('.ics')) return;                                       // données personnelles : jamais en cache
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put('index.html', cp)); return r; })
      .catch(() => caches.match('index.html').then((r) => r || caches.match('offline.html'))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
