// Service worker עבור "קסם החשבון" — מאפשר התקנה כאפליקציה ועבודה אופליין.
// בעת שינוי בקבצי הליבה צריך להעלות את המספר כדי לרענן את המטמון של משתמשים קיימים.
const VERSION = 'kesem-v1';
const CORE = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // ניווט/HTML: רשת תחילה (כדי לקבל עדכונים), נפילה למטמון כשאין רשת.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        caches.open(VERSION).then(c => c.put('./index.html', res.clone()));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // שאר הנכסים (CSS, תמונות, גופנים): מטמון תחילה, ורענון ברקע.
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
