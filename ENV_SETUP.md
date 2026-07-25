# Variáveis de Ambiente

## Google Gemini API (servidor)
- `GEMINI_API_KEY`: API Key do Google Gemini — **somente servidor**
- Não use `VITE_GEMINI_API_KEY` (legado removido do bundle do browser)
- Modelo padrão: **`gemini-3.5-flash-lite`** (mais barato), com fallback para `gemini-3.6-flash` / `gemini-3.5-flash`
- Opcional: `VITE_GEMINI_MODEL` para forçar outro modelo no topo da cadeia

## Google Search API (RAG — servidor)
1. Crie uma Custom Search Engine: https://programmablesearchengine.google.com/
2. Habilite Custom Search API no Google Cloud e crie uma API Key
3. Configure:
   ```
   GOOGLE_SEARCH_API_KEY=sua_api_key_aqui
   GOOGLE_SEARCH_ENGINE_ID=seu_search_engine_id_aqui
   ```

## Groq API (opcional — servidor)
- `GROQ_API_KEY`: fallback de chat

## Firebase (client — públicos)
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Firebase Admin (servidor)
- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON da service account (necessário para auth das rotas `/api/gemini`, `/api/groq`, `/api/google-search`)

## Como configurar
1. Copie `.env.vercel.example` para `.env.local`
2. Substitua pelos valores reais
3. `.env*` já está no `.gitignore`
