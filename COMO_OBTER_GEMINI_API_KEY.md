# 🔑 Como Obter a API Key do Google Gemini

## 📍 Link Direto
**Acesse:** https://aistudio.google.com/app/apikey

## 📝 Passo a Passo Detalhado

### 1. Acesse o Google AI Studio
- Vá para: **https://aistudio.google.com/app/apikey**
- Você precisa estar logado com uma conta Google

### 2. Criar uma Nova API Key
- Clique no botão **"Create API Key"** ou **"Criar chave de API"**
- Se for a primeira vez, pode pedir para criar um projeto no Google Cloud
  - Escolha um nome para o projeto (ex: "PLEGIMENTORIA")
  - Aceite os termos

### 3. Copiar a API Key
- Uma chave será gerada automaticamente
- **IMPORTANTE:** Copie a chave imediatamente, pois ela só aparece uma vez!
- A chave terá formato: `AIzaSy...` (bem longa)

### 4. Adicionar no Projeto
- Abra o arquivo `.env` na raiz do projeto
- Encontre a linha: `VITE_GEMINI_API_KEY=SUA_API_KEY_AQUI`
- Substitua `SUA_API_KEY_AQUI` pela chave que você copiou
- Salve o arquivo

### 5. Reiniciar o Servidor
- Pare o servidor (Ctrl+C)
- Inicie novamente: `npm run dev`
- O chat IA agora funcionará com o Gemini!

## ⚠️ Importante
- A API key é **GRATUITA** para uso moderado
- Google oferece um limite generoso de requisições gratuitas
- Mantenha a chave segura (não compartilhe publicamente)
- Se perder a chave, pode criar uma nova no mesmo link

## 🎯 Pronto!
Depois de configurar, o chat IA usará o Gemini para responder dúvidas sobre:
- Português
- Área de Atuação (PL)
- Raciocínio Lógico
- Constitucional
- Administrativo
- Legislação Estadual
- Realidade de Goiás
- Redação






