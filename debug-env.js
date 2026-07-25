// Arquivo temporário para debug — não loga previews de keys
console.log('Environment check:', {
  geminiClientKey: 'bloqueada no client (use proxy /api/gemini)',
  groqClientKey: 'bloqueada no client (use proxy /api/groq)',
  mode: import.meta.env.MODE,
})
