// Service Worker para PWA - FlashConCards
// Versão do cache - Incremente para forçar atualização
const CACHE_NAME = 'flashconcards-v1.0.5'
const RUNTIME_CACHE = 'flashconcards-runtime-v1.0.5'

// Flag para desabilitar cache se houver problemas persistentes
let CACHE_DISABLED = false
let CACHE_ERROR_COUNT = 0
const MAX_CACHE_ERRORS = 5

// Função para limpar completamente todos os caches (último recurso)
const clearAllCaches = async () => {
  try {
    if (!('caches' in self)) return false
    
    const cacheNames = await caches.keys()
    await Promise.allSettled(
      cacheNames.map(name => caches.delete(name))
    )
    console.log('[SW] Todos os caches foram limpos')
    CACHE_ERROR_COUNT = 0
    CACHE_DISABLED = false
    return true
  } catch (e) {
    console.error('[SW] Erro ao limpar todos os caches:', e)
    CACHE_DISABLED = true
    return false
  }
}

// Função helper para abrir cache com fallback
const safeOpenCache = async (cacheName) => {
  if (CACHE_DISABLED || !('caches' in self)) {
    return null
  }
  
  try {
    return await caches.open(cacheName)
  } catch (openError) {
    CACHE_ERROR_COUNT++
    
    // Se já desabilitado, não tentar mais
    if (CACHE_DISABLED) {
      return null
    }
    
    // Se muitos erros, desabilitar cache imediatamente
    if (CACHE_ERROR_COUNT >= MAX_CACHE_ERRORS) {
      console.warn('[SW] Muitos erros de cache detectados. Desabilitando cache...')
      CACHE_DISABLED = true
      // Tentar limpar em background (não bloqueia)
      clearAllCaches().catch(() => {})
      return null
    }
    
    // Tentar deletar e recriar este cache específico (apenas 1 vez)
    if (CACHE_ERROR_COUNT <= 2) {
      try {
        await caches.delete(cacheName)
        return await caches.open(cacheName)
      } catch (recreateError) {
        // Se falhar ao recriar, incrementar contador
        CACHE_ERROR_COUNT++
        return null
      }
    }
    
    return null
  }
}

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
    safeOpenCache(CACHE_NAME)
      .then(async (cache) => {
        if (!cache) {
          console.warn('[SW] Cache não disponível durante instalação')
          return self.skipWaiting()
        }
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
    (async () => {
      // Verificar se CacheStorage está funcionando
      try {
        if (!('caches' in self)) {
          console.warn('[SW] CacheStorage não disponível - cache desabilitado')
          CACHE_DISABLED = true
          return self.clients.claim()
        }
        
        // Testar se consegue abrir cache
        try {
          await caches.open(CACHE_NAME)
        } catch (testError) {
          console.warn('[SW] Erro ao testar cache na ativação, limpando todos os caches...', testError)
          await clearAllCaches()
        }
      } catch (e) {
        console.error('[SW] Erro crítico na ativação:', e)
        CACHE_DISABLED = true
        return self.clients.claim()
      }
      
      const cacheNames = await caches.keys()
      // Remover caches antigos
      const deletePromises = cacheNames
        .filter((cacheName) => {
          return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE
        })
        .map((cacheName) => {
          console.log('[SW] Deleting old cache:', cacheName)
          return caches.delete(cacheName)
        })
      
      await Promise.allSettled(deletePromises)
      
      // Limpar cache inválido dos caches atuais
      const cleanInvalidCache = async () => {
        const cache = await safeOpenCache(RUNTIME_CACHE)
        if (!cache) {
          return
        }
          
          let keys
          try {
            keys = await cache.keys()
          } catch (keysError) {
            console.warn('[SW] Erro ao obter chaves do cache na ativação:', keysError)
            return
          }
          
          let removedCount = 0
          
          for (const key of keys) {
            try {
              if (key.headers?.get('accept')?.includes('text/html')) {
                const response = await cache.match(key)
                if (response) {
                  const isValid = await validateHTML(response)
                  if (!isValid) {
                    try {
                      await cache.delete(key)
                      removedCount++
                      console.log('[SW] Removido cache inválido na ativação:', key.url)
                    } catch (deleteError) {
                      console.warn('[SW] Erro ao deletar cache inválido na ativação:', deleteError)
                    }
                  }
                }
              }
            } catch (itemError) {
              // Continuar com próximo item
              console.warn('[SW] Erro ao processar item do cache na ativação:', itemError)
            }
          }
          
          if (removedCount > 0) {
            console.log(`[SW] Limpeza concluída: ${removedCount} cache(s) inválido(s) removido(s)`)
          }
        } catch (e) {
          // Erro geral - não crítico, apenas logar
          console.warn('[SW] Erro ao limpar cache inválido na ativação (não crítico):', e.message || e)
        }
      }
      
      await cleanInvalidCache()
      
      // Assume controle de todas as páginas imediatamente
      return self.clients.claim()
    })()
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
      const cache = await safeOpenCache(RUNTIME_CACHE)
      if (!cache) {
        return
      }
        
        let keys
        try {
          keys = await cache.keys()
        } catch (keysError) {
          console.warn('[SW] Erro ao obter chaves do cache:', keysError)
          return
        }
        
        for (const key of keys) {
          try {
            if (key.headers?.get('accept')?.includes('text/html')) {
              const response = await cache.match(key)
              if (response) {
                const isValid = await validateHTML(response)
                if (!isValid) {
                  try {
                    await cache.delete(key)
                    console.log('[SW] Removido cache inválido:', key.url)
                  } catch (deleteError) {
                    console.warn('[SW] Erro ao deletar cache inválido:', deleteError)
                  }
                }
              }
            }
          } catch (itemError) {
            // Continuar com próximo item mesmo se houver erro
            console.warn('[SW] Erro ao processar item do cache:', itemError)
          }
        }
      } catch (e) {
        // Erro geral - não bloquear a aplicação
        console.warn('[SW] Erro ao limpar cache inválido (não crítico):', e.message || e)
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
            safeOpenCache(RUNTIME_CACHE).then((cache) => {
              if (cache) {
                cache.put(request, responseToCache).catch((cacheError) => {
                  // Erro ao cachear não é crítico - apenas logar
                  console.warn('[SW] Erro ao cachear resposta (não crítico):', cacheError)
                })
              }
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
          try {
            const cachedResponse = await caches.match(request)
            if (cachedResponse) {
              // Validar cache antes de retornar
              const isValid = await validateHTML(cachedResponse)
              if (isValid) {
                return cachedResponse
              } else {
                // Cache inválido, remover
                const cache = await safeOpenCache(RUNTIME_CACHE)
                if (cache) {
                  try {
                    await cache.delete(request)
                  } catch (deleteError) {
                    console.warn('[SW] Erro ao deletar cache inválido:', deleteError)
                  }
                }
              }
            }
          } catch (cacheError) {
            console.warn('[SW] Erro ao acessar cache:', cacheError)
          }
          
          // Se não tem cache válido, tentar index.html como último recurso
          try {
            const indexResponse = await caches.match('/index.html')
            if (indexResponse) {
              const isValid = await validateHTML(indexResponse)
              if (isValid) {
                return indexResponse
              }
            }
          } catch (indexError) {
            console.warn('[SW] Erro ao acessar index.html do cache:', indexError)
          }
          
          // Último recurso: tentar raiz
          try {
            return await caches.match('/')
          } catch (rootError) {
            // Se tudo falhar, retornar resposta de erro básica
            return new Response('Offline - Não foi possível carregar a página', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            })
          }
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
              safeOpenCache(cacheToUse).then((cache) => {
                if (cache) {
                  cache.put(request, responseToCache).catch(() => {})
                }
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
          safeOpenCache(cacheToUse).then((cache) => {
            if (cache) {
              cache.put(request, responseToCache).catch((cacheError) => {
                console.warn('[SW] Erro ao cachear asset (não crítico):', cacheError)
              })
            }
          })

          return response
        }).catch(() => {
          // Se falhar completamente, tenta retornar do cache (mesmo que já tenha tentado)
          return caches.match(request).catch(() => {
            // Se cache também falhar, retornar undefined (navegador tratará)
            return undefined
          })
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
          safeOpenCache(RUNTIME_CACHE).then((cache) => {
            if (cache) {
              cache.put(request, responseToCache).catch((cacheError) => {
                console.warn('[SW] Erro ao cachear recurso (não crítico):', cacheError)
              })
            }
          })
        }
        return response
      })
      .catch(() => {
        return caches.match(request).catch(() => {
          // Se cache falhar, retornar undefined
          return undefined
        })
      })
  )
})

// Limpar cache antigo periodicamente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    // Verificar se CacheStorage está disponível
    if (!('caches' in self)) {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: false, error: 'CacheStorage não disponível' })
      }
      return
    }
    
    caches.keys()
      .then((cacheNames) => {
        return Promise.allSettled(
          cacheNames.map((cacheName) => {
            return caches.delete(cacheName)
          })
        )
      })
      .then((results) => {
        const success = results.every(r => r.status === 'fulfilled')
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ 
            success, 
            message: success ? 'Cache limpo com sucesso' : 'Alguns caches não puderam ser limpos'
          })
        }
      })
      .catch((error) => {
        console.error('[SW] Erro ao limpar cache via mensagem:', error)
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ 
            success: false, 
            error: error.message || 'Erro desconhecido ao limpar cache'
          })
        }
      })
  }
})

