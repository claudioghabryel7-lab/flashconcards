// Service Worker para PWA - FlashConCards
// Versão do cache - Incremente para forçar atualização
const CACHE_NAME = 'flashconcards-v1.0.3'
const RUNTIME_CACHE = 'flashconcards-runtime-v1.0.3'

// Arquivos para cache imediato (cache-first) - recursos críticos
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/logo.svg',
  '/manifest.json'
]

// Função para validar HTML (usada em múltiplos lugares)
const validateHTML = async (response) => {
  if (!response || !response.ok) return false
  
  try {
    const text = await response.clone().text()
    // Verificar se contém elementos essenciais da aplicação
    const hasRoot = text.includes('id="root"') || text.includes("id='root'")
    const hasScripts = text.includes('<script') && text.includes('main.jsx')
    const hasContent = text.length > 1000 // HTML válido deve ter pelo menos 1KB
    
    return hasRoot && hasScripts && hasContent
  } catch (e) {
    return false
  }
}

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...')
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Caching static assets for offline use')
        // Cachear recursos críticos, mas validar HTML antes
        const cachePromises = STATIC_CACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url)
            // Se for HTML, validar antes de cachear
            if (url.endsWith('.html') || url === '/') {
              const isValid = await validateHTML(response)
              if (isValid) {
                return cache.put(url, response)
              } else {
                console.warn(`[SW] HTML inválido não cacheado: ${url}`)
                return Promise.resolve()
              }
            } else {
              // Para outros recursos, cachear normalmente
              return cache.put(url, response)
            }
          } catch (error) {
            console.warn(`[SW] Erro ao cachear ${url}:`, error)
            return Promise.resolve()
          }
        })
        return Promise.all(cachePromises)
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
    caches.keys().then(async (cacheNames) => {
      // Remover caches antigos
      const deletePromises = cacheNames
        .filter((cacheName) => {
          return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE
        })
        .map((cacheName) => {
          console.log('[SW] Deleting old cache:', cacheName)
          return caches.delete(cacheName)
        })
      
      await Promise.all(deletePromises)
      
      // Limpar cache inválido dos caches atuais
      const cleanInvalidCache = async () => {
        try {
          const cache = await caches.open(RUNTIME_CACHE)
          const keys = await cache.keys()
          let removedCount = 0
          
          for (const key of keys) {
            if (key.headers.get('accept')?.includes('text/html')) {
              const response = await cache.match(key)
              if (response) {
                const isValid = await validateHTML(response)
                if (!isValid) {
                  await cache.delete(key)
                  removedCount++
                  console.log('[SW] Removido cache inválido na ativação:', key.url)
                }
              }
            }
          }
          
          if (removedCount > 0) {
            console.log(`[SW] Limpeza concluída: ${removedCount} cache(s) inválido(s) removido(s)`)
          }
        } catch (e) {
          console.error('[SW] Erro ao limpar cache inválido na ativação:', e)
        }
      }
      
      await cleanInvalidCache()
      
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

  // Para páginas HTML - Network First com validação de conteúdo
  // Isso previne cachear páginas em branco ou inválidas
  if (request.headers.get('accept')?.includes('text/html')) {
    // Função para limpar cache inválido (em background)
    const clearInvalidCache = async () => {
      try {
        const cache = await caches.open(RUNTIME_CACHE)
        const keys = await cache.keys()
        for (const key of keys) {
          if (key.headers.get('accept')?.includes('text/html')) {
            const response = await cache.match(key)
            if (response) {
              const isValid = await validateHTML(response)
              if (!isValid) {
                await cache.delete(key)
                console.log('[SW] Removido cache inválido:', key.url)
              }
            }
          }
        }
      } catch (e) {
        console.error('[SW] Erro ao limpar cache inválido:', e)
      }
    }
    
    // Limpar cache inválido em background (não bloqueia a resposta)
    clearInvalidCache().catch(() => {})
    
    event.respondWith(
      // Estratégia Network First: tentar rede primeiro
      fetch(request)
        .then(async (networkResponse) => {
          // Validar resposta da rede antes de cachear
          const isValid = await validateHTML(networkResponse)
          
          if (isValid && networkResponse.status === 200) {
            // Cache apenas se for válido
            const responseToCache = networkResponse.clone()
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseToCache)
            })
            return networkResponse
          }
          
          // Se resposta inválida, tentar cache
          if (!isValid) {
            console.warn('[SW] Resposta da rede inválida, tentando cache...')
            const cachedResponse = await caches.match(request)
            if (cachedResponse) {
              const cachedIsValid = await validateHTML(cachedResponse)
              if (cachedIsValid) {
                return cachedResponse
              }
            }
          }
          
          // Se não tem cache válido, retornar resposta da rede mesmo que inválida
          // (melhor que tela em branco)
          return networkResponse
        })
        .catch(async () => {
          // Rede falhou, tentar cache
          const cachedResponse = await caches.match(request)
          if (cachedResponse) {
            // Validar cache antes de retornar
            const isValid = await validateHTML(cachedResponse)
            if (isValid) {
              return cachedResponse
            } else {
              // Cache inválido, remover
              const cache = await caches.open(RUNTIME_CACHE)
              await cache.delete(request)
            }
          }
          
          // Se não tem cache válido, tentar index.html como último recurso
          const indexResponse = await caches.match('/index.html')
          if (indexResponse) {
            const isValid = await validateHTML(indexResponse)
            if (isValid) {
              return indexResponse
            }
          }
          
          // Último recurso: tentar raiz
          return caches.match('/')
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

