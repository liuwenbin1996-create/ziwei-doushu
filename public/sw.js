'use strict';

// This worker never stores pages, API responses, chart data or AI text.
// Bump this version when changing the offline page or icons.
const CACHE_PREFIX = 'ziwei-guanxing-';
const CACHE_NAME = `${CACHE_PREFIX}static-v1`;
const OFFLINE_URL = '/offline.html';
const PUBLIC_ASSETS = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];
const MAX_BUILD_ASSETS = 80;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Deliberately do not pre-cache '/' or any page containing user data.
    await cache.addAll(PUBLIC_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  if (request.headers.has('authorization')) return;

  if (request.mode === 'navigate') {
    // Always go to the network. Never persist rendered HTML or query strings.
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_URL)) || new Response(
        '当前处于离线状态，请恢复网络后重新打开紫微 · 观星。',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      );
    }));
    return;
  }

  if (url.search) return;
  const isPublicAsset = PUBLIC_ASSETS.includes(url.pathname);
  const isBuildAsset = url.pathname.startsWith('/_next/static/')
    && /\.(?:js|css|woff2?)$/.test(url.pathname);
  if (!isPublicAsset && !isBuildAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    const policy = response.headers.get('cache-control') || '';
    if (response.ok && response.type === 'basic' && !/no-store|private/i.test(policy)) {
      try {
        await cache.put(request, response.clone());
        const assets = (await cache.keys()).filter((key) =>
          new URL(key.url).pathname.startsWith('/_next/static/'));
        if (assets.length > MAX_BUILD_ASSETS) {
          await Promise.all(assets.slice(0, assets.length - MAX_BUILD_ASSETS)
            .map((key) => cache.delete(key)));
        }
      } catch {
        // Quota/storage restrictions must not break a successful network response.
      }
    }
    return response;
  })());
});
