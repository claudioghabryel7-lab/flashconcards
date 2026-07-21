# Variáveis de Ambiente

## Google Gemini API
- `VITE_GEMINI_API_KEY`: Única API Key do Google Gemini usada pelo app

## Google Search API (para RAG)
Para implementar RAG (Retrieval-Augmented Generation) e evitar alucinações:

1. **Criar uma Custom Search Engine (CSE):**
   - Acesse: https://programmablesearchengine.google.com/
   - Clique em "Adicionar"
   - Configure para buscar em todo o web ou sites específicos
   - Obtenha o Search Engine ID (cx)

2. **Obter API Key do Google Search:**
   - Acesse: https://console.cloud.google.com/
   - Crie um projeto ou use um existente
   - Habilite "Custom Search API"
   - Crie credenciais API Key
   - Restrinja a API key para Custom Search API

3. **Configurar variáveis de ambiente:**
   ```
   VITE_GOOGLE_SEARCH_API_KEY=sua_api_key_aqui
   VITE_GOOGLE_SEARCH_ENGINE_ID=seu_search_engine_id_aqui
   ```

## Firebase
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Groq API (opcional - fallback)
- `VITE_GROQ_API_KEY`: API Key do Groq para fallback

## Como configurar
1. Copie as variáveis acima para um arquivo `.env` na raiz do projeto
2. Substitua os valores pelas suas chaves reais
3. O arquivo `.env` já está no `.gitignore` para não commitar credenciais
