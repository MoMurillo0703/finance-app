const CACHE_NAME = 'lala-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      const oldCaches = cacheNames.filter((name) => name !== CACHE_NAME)
      return Promise.all([
        ...oldCaches.map((name) => caches.delete(name)),
        self.clients.claim(),
      ]).then(() => {
        if (oldCaches.length > 0) {
          return self.clients.matchAll({ type: 'window' }).then((clients) => {
            clients.forEach((client) => {
              client.postMessage({ type: 'UPDATE_AVAILABLE' })
            })
          })
        }
      })
    })
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const networkUpdate = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone())
            }
            return response
          })
          .catch(() => cached)

        if (cached) {
          networkUpdate
          return cached
        }

        return networkUpdate
      })
    )
  )
})
