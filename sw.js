// Service worker for شجرة أسرة الصالح — lets the site be added to a phone's
// home screen and keeps working on a weak/offline connection.
//
// Bump this version string whenever the cached files change, so returning
// visitors pick up the new version instead of being stuck on an old one.
const CACHE_NAME = 'alsaleh-tree-v6';

// The static "shell" -- same for every visitor, safe to cache aggressively
// and serve instantly, refreshed quietly in the background.
const APP_SHELL = [
  'index.html',
  'admin.html',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'favicon-48x48.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'og-image.png',
  'site.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never touch writes (the admin panel's GitHub API calls are PUT/POST),
  // and never touch any other-origin request (GitHub's API itself) --
  // those must always go straight to the network, untouched.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations (typing the URL, opening from the home-screen icon):
  // try the network first for the freshest page, and fall back to whichever
  // cached page matches when there's no connection.
  if (req.mode === 'navigate') {
    const fallback = url.pathname.endsWith('admin.html') ? 'admin.html' : 'index.html';
    event.respondWith(
      fetch(req).catch(() => caches.match(fallback))
    );
    return;
  }

  // The tree data changes over time (the admin panel appends to these
  // files), so it needs network-first: always prefer the freshest copy when
  // online, and only fall back to the last-seen copy when offline -- never
  // the other way around, or new additions/corrections would stay invisible.
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else (the app shell, icons): stale-while-revalidate -- an
  // instant response from cache when there is one, with a background fetch
  // that quietly refreshes the cache for next time.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});