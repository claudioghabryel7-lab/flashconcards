# Variáveis de Ambiente

## IA local (Ollama no PC) — padrão do app
O site chama a IA **como se fosse Gemini**, mas o servidor encaminha para o Ollama no seu PC.

1. Instale e rode o Ollama no PC: https://ollama.com
2. Baixe um modelo, por exemplo:
   ```bash
   ollama pull phi
   ```
3. Configure no `.env.local` (ou Vercel):
   ```
   OLLAMA_BASE_URL=https://violet-webs-poke.loca.lt
   OLLAMA_MODEL=phi
   ```

### Dois jeitos de usar

**A) Site + Ollama no mesmo PC (mais simples)**  
- Rode `npm run dev` (ou `npm start`) no PC  
- `OLLAMA_BASE_URL=http://localhost:11434`  
- Deixe o PC ligado com o Ollama aberto

**B) Site na Vercel + Ollama no PC (seu caso com localtunnel)**  
- A Vercel **não** alcança `localhost` do seu PC  
- Exponha o Ollama: `npx localtunnel --port 11434`  
- Coloque a URL pública em `OLLAMA_BASE_URL` no painel da Vercel  
- **Não feche** a janela do túnel; se reiniciar o PC, a URL muda e precisa atualizar de novo  
- Redeploy após mudar a variável

**Nota sobre o modelo `phi`:** é leve (3B) e tem contexto curto (~2048). Serve para testes; para material longo, prefira `llama3.2` ou `qwen2.5:7b`.

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
