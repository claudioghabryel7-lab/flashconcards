// Service Worker para PWA - FlashConCards
// Versão do cache - Incremente para forçar atualização
const CACHE_NAME = 'flashconcards-v1.0.2'
const RUNTIME_CACHE = 'flashconcards-runtime-v1.0.2'

// Arquivos para cache imediato (cache-first) - recursos críticos
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/logo.svg',
  '/manifest.json'
]

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...')
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets for offline use')
        // Cachear recursos críticos para funcionar offline
        return cache.addAll(STATIC_CACHE_URLS)
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully')
        return self.skipWaiting() // Ativa imediatamente
      })
      .catch((error) => {
        console.error('[SW] Error caching static assets:', error)
        // Mesmo com erro, ativa o service worker
        return self.skipWaiting()
      })
  )
})

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            // Remove caches antigos
            return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE
          })
          .map((cacheName) => {
            console.log('[SW] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          })
      )
    }).then(() => {
      // Assume controle de todas as páginas imediatamente
      return self.clients.claim()
    })
  )
})

// Estratégia de cache: Network First com fallback para cache
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignorar requisições que não são GET
  if (request.method !== 'GET') {
    return
  }

  // Ignorar requisições para APIs externas (Firebase, etc) - sempre usar network
  if (
    url.origin.includes('firebase') ||
    url.origin.includes('googleapis') ||
    url.origin.includes('googletagmanager') ||
    url.origin.includes('mercadopago') ||
    url.origin.includes('generativelanguage') ||
    url.origin.includes('groq')
  ) {
    return // Deixa passar direto, sem cache
  }

  // Ignorar arquivos JS/CSS com hash (modules) - sempre usar network para evitar problemas de MIME type
  // Isso previne que arquivos JS/CSS sejam interceptados e retornem HTML (404) causando erro de MIME type
  if (url.pathname.startsWith('/assets/') && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    return // Deixa passar direto, sem cache - evita problemas de MIME type
  }

  // Para páginas HTML - Cache First com atualização em background
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Tentar buscar atualização em background se tiver cache
        const fetchPromise = fetch(request)
          .then((response) => {
            // Clone a resposta antes de cachear
            const responseToCache = response.clone()
            
            // Cache apenas respostas válidas
            if (response.status === 200 && response.type === 'basic') {
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseToCache)
              })
            }
            
            return response
          })
          .catch(() => null) // Ignorar erros de rede
        
        // Se tem cache, retorna imediatamente e atualiza em background
        if (cachedResponse) {
          // Atualizar cache em background sem bloquear resposta
          fetchPromise.then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, networkResponse.clone())
              })
            }
          }).catch(() => {}) // Ignorar erros
          
          return cachedResponse
        }
        
        // Se não tem cache, espera pela rede ou retorna index.html como fallback
        return fetchPromise.then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            return networkResponse
          }
          // Se falhar e não tem cache desta página, retorna index.html
          return caches.match('/index.html').then((indexResponse) => {
            return indexResponse || caches.match('/')
          })
        }).catch(() => {
          // Se completamente offline, tenta retornar index.html
          return caches.match('/index.html').then((indexResponse) => {
            return indexResponse || caches.match('/')
          })
        })
      })
    )
    return
  }

  // Para outros assets estáticos (apenas imagens e fontes) - Cache First (otimizado para offline)
  // JS/CSS já são ignorados acima
  if (
    url.pathname.includes('.svg') ||
    url.pathname.includes('.png') ||
    url.pathname.includes('.jpg') ||
    url.pathname.includes('.jpeg') ||
    url.pathname.includes('.webp') ||
    url.pathname.includes('.woff') ||
    url.pathname.includes('.woff2')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Cache first - retorna do cache imediatamente se disponível
        if (cachedResponse) {
          // Atualizar cache em background para próxima vez
          fetch(request).then((response) => {
            if (response && response.status === 200) {
              const responseToCache = response.clone()
              const cacheToUse = url.pathname.startsWith('/assets/') ? CACHE_NAME : RUNTIME_CACHE
              caches.open(cacheToUse).then((cache) => {
                cache.put(request, responseToCache)
              })
            }
          }).catch(() => {}) // Ignorar erros de rede
          
          return cachedResponse
        }

        // Se não tem no cache, busca da rede e cacheia
        return fetch(request).then((response) => {
          // Não cachear se não for sucesso
          if (!response || response.status !== 200) {
            return response
          }

          const responseToCache = response.clone()
          const cacheToUse = url.pathname.startsWith('/assets/') ? CACHE_NAME : RUNTIME_CACHE
          caches.open(cacheToUse).then((cache) => {
            cache.put(request, responseToCache)
          })

          return response
        }).catch(() => {
          // Se falhar completamente, tenta retornar do cache (mesmo que já tenha tentado)
          return caches.match(request)
        })
      })
    )
    return
  }

  // Para outros recursos - Network First
  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseToCache = response.clone()
        if (response.status === 200) {
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache)
          })
        }
        return response
      })
      .catch(() => {
        return caches.match(request)
      })
  )
})

// Limpar cache antigo periodicamente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          return caches.delete(cacheName)
        })
      )
    }).then(() => {
      event.ports[0].postMessage({ success: true })
    })
  }
})

