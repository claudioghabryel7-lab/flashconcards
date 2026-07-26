# Variáveis de Ambiente

## IA local (Ollama no PC) — padrão do app

### Modo recomendado: SEM túnel
O **navegador no seu PC** chama `http://127.0.0.1:11434` direto.  
Você abre o site normal no Chrome; a IA roda no PC. **Não precisa de localtunnel.**

1. Instale e rode o Ollama: https://ollama.com
2. Baixe o modelo:
   ```bash
   ollama pull phi
   ```
3. **Libere CORS** no Windows (PowerShell, depois reinicie o Ollama):
   ```powershell
   [System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "User")
   ```
   Feche o Ollama na bandeja e abra de novo.
4. Abra o site no Chrome **neste mesmo PC** e gere conteúdo.

Opcional no Vercel (URL/modelo no browser):
```
VITE_OLLAMA_BASE_URL=http://127.0.0.1:11434
VITE_OLLAMA_MODEL=phi
```

### Fallback com túnel (só se localhost/CORS falhar)
```
OLLAMA_BASE_URL=https://seu-tunel.loca.lt
OLLAMA_MODEL=phi
```
+ `npx localtunnel --port 11434` (não fechar o CMD)

**Nota sobre o modelo `phi`:** contexto curto (~2048). Para material longo: `ollama pull llama3.2`.

## Google Search API (RAG — opcional)
1. Crie uma Custom Search Engine: https://programmablesearchengine.google.com/
2. Habilite Custom Search API no Google Cloud e crie uma API Key
3. Configure:
   ```
   GOOGLE_SEARCH_API_KEY=sua_api_key_aqui
   GOOGLE_SEARCH_ENGINE_ID=seu_search_engine_id_aqui
   ```

## Groq API (opcional — servidor)
- `GROQ_API_KEY`: fallback de chat (não é o caminho principal)

## Firebase (client — públicos)
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Firebase Admin (servidor)
- Auth das rotas `/api/gemini`, `/api/groq`, `/api/google-search`: usa o ID token do usuário logado
  - **Não exige** service account — basta `VITE_FIREBASE_API_KEY` no Vercel
  - Opcional: `FIREBASE_SERVICE_ACCOUNT_JSON` para Admin SDK (webhook Mercado Pago / grant access)

## Como configurar
1. Copie `.env.vercel.example` para `.env.local`
2. Substitua pelos valores reais
3. `.env*` já está no `.gitignore`

## Notas
- TTS (vozes) ainda depende de endpoints Gemini e **não** roda no Ollama.
- Cloud Functions (`functions/`) podem ainda referenciar Gemini legado; o app Next (site) usa Ollama.
