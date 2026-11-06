const CACHE_NAME = 'skala-prioritas-static-v4';
const PUBLIC_ASSET_PATTERN = /\.(?:avif|css|eot|gif|ico|jpe?g|js|mjs|png|svg|ttf|webp|woff2?)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName === 'tailwind-admin-cache-v1' ||
                cacheName.startsWith('skala-prioritas-static-'),
            )
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() ?? '' };
  }

  const title =
    typeof data.title === 'string' && data.title
      ? data.title
      : 'Notifikasi Skala Prioritas';
  const url =
    typeof data.url === 'string' &&
    data.url.startsWith('/') &&
    !data.url.startsWith('//')
      ? data.url
      : '/apps/tickets';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path =
    typeof event.notification.data?.url === 'string' &&
    event.notification.data.url.startsWith('/') &&
    !event.notification.data.url.startsWith('//')
      ? event.notification.data.url
      : '/apps/tickets';
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(
      (windowClients) => {
        const appWindow = windowClients.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (appWindow) {
          return appWindow.navigate(targetUrl).then(() => appWindow.focus());
        }
        return self.clients.openWindow(targetUrl);
      },
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNextStaticAsset = url.pathname.startsWith('/_next/static/');
  const isPublicAsset =
    !url.pathname.startsWith('/api/') &&
    PUBLIC_ASSET_PATTERN.test(url.pathname);
  if (!isNextStaticAsset && !isPublicAsset) return;

  event.respondWith(
    (async () => {
      if (isNextStaticAsset) {
        try {
          const response = await fetch(request);
          if (response.ok && response.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          throw error;
        }
      }

      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;

      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
