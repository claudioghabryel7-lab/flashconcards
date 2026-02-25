// Debug para verificar API Key em produção
console.log('=== DEBUG API KEY ===')
console.log('API Key presente:', !!import.meta.env.VITE_GEMINI_API_KEY)
console.log('API Key começa com:', import.meta.env.VITE_GEMINI_API_KEY?.substring(0, 10) + '...')
console.log('Ambiente:', import.meta.env.MODE)
console.log('NODE_ENV:', import.meta.env.NODE_ENV)
console.log('========================')

// Teste rápido da API
if (import.meta.env.VITE_GEMINI_API_KEY) {
  console.log('✅ API Key encontrada no ambiente')
} else {
  console.error('❌ API Key NÃO encontrada no ambiente!')
}
