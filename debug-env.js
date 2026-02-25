// Arquivo temporário para debug
// Verifique se a API key está disponível em produção
console.log('Environment check:', {
  apiKey: import.meta.env.VITE_GEMINI_API_KEY ? '✅ Present' : '❌ Missing',
  apiKeyLength: import.meta.env.VITE_GEMINI_API_KEY?.length || 0
})
