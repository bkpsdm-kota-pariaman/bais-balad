// sw.js (sesuai struktur folder: api, css, icons, js, index.html, manifest.json)
// NAIKKAN VERSI INI SETIAP KALI ADA PERUBAHAN ASET (CSS, JS, dll)
// Pastikan formatnya sama dengan APP_VERSION di app.js untuk konsistensi.
const CACHE_NAME = 'eabsen-v6.0.5';

// Semua path relatif ke lokasi sw.js (pakai ./ karena PWA di subfolder)
const ASSETS_TO_CACHE = [
  './index.html',
  './js/app.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/tailwinds.min.css',
  './css/bootstrap-icons.css',
  './css/fonts/bootstrap-icons.woff',
  './css/fonts/bootstrap-icons.woff2',
  './js/sweetalert2.all.min.js',
  './js/html5-qrcode.min.js',
  './js/qrcode.min.js',
  './js/localforage.min.js'
];

// Install: precache shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // opsional: aktifkan segera (tanpa skipWaiting di sini)
});

// Activate: hapus cache lama dan klaim client
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.map(name => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: dapatkan path scope (mis. '/subfolder/')
function getScopePath() {
  try {
    const scope = new URL(self.registration.scope).pathname;
    return scope.endsWith('/') ? scope : scope + '/';
  } catch (e) {
    return '/';
  }
}

// Fetch: strategi berbeda untuk API, navigasi, dan aset statis
self.addEventListener('fetch', event => {
  const reqUrl = new URL(event.request.url);
  const scopePath = getScopePath(); // contoh: '/pwa/'

  // STRATEGI BARU: Selalu ambil manifest.json dari jaringan.
  // Ini sangat penting agar browser dapat mendeteksi pembaruan pada nama, ikon, dll.
  // Jangan pernah cache file manifest.json.
  if (reqUrl.pathname.endsWith('/manifest.json')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 1) API relatif ke scope, mis. '/pwa/api/...'
  if (reqUrl.pathname.startsWith(scopePath + 'api/')) {
    // network-first untuk API
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Server down' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 2) Navigasi (HTML) -> App Shell (index.html)
  // Hanya layani index.html untuk permintaan navigasi ke root aplikasi.
  // Permintaan navigasi lain (seperti ke admin.html) akan dilewatkan ke jaringan.
  const isAppShellRequest = event.request.mode === 'navigate' && (reqUrl.pathname === scopePath || reqUrl.pathname.endsWith('/index.html'));
  if (isAppShellRequest) {
    event.respondWith(
      caches.match('./index.html').then(cached => {
        // Selalu berikan index.html dari cache jika ada, atau dari jaringan jika tidak.
        return cached || fetch('./index.html');
      })
    );
    return;
  }

  // 3) Aset statis & Navigasi Lainnya (seperti admin.html) -> cache-first, lalu network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        // jangan cache jika response tidak OK
        if (!resp || resp.status !== 200 || (resp.type !== 'basic' && resp.type !== 'cors')) {
          return resp;
        }
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => {
          // gunakan request yang sama seperti yang diminta (relatif ke scope)
          cache.put(event.request, clone).catch(() => {/* ignore put errors */});
        });
        return resp;
      }).catch(() => {
        // jika fetch gagal dan tidak ada cache, kembalikan fallback (opsional)
        // return caches.match('./offline.html') // jika Anda punya offline page
        return new Response('', { status: 504, statusText: 'Gateway Timeout' });
      });
    })
  );
});

// Pesan dari client: SKIP_WAITING dan GET_VERSION
self.addEventListener('message', event => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'GET_VERSION') {
    // kirim balik via MessageChannel port jika tersedia
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: CACHE_NAME });
    } else {
      // fallback: broadcast ke semua client
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_VERSION', version: CACHE_NAME }));
      });
    }
  }
});
