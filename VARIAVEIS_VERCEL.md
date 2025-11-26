# 🔑 Variáveis de Ambiente para Vercel

Copie e cole estas variáveis no painel do Vercel em **Settings > Environment Variables**.

## 📋 Lista Completa de Variáveis

Adicione cada uma dessas variáveis no Vercel:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_GEMINI_API_KEY
```

## 📝 Como Adicionar no Vercel

1. Acesse seu projeto no Vercel
2. Vá em **Settings** > **Environment Variables**
3. Clique em **Add New**
4. Cole o **nome da variável** (ex: `VITE_FIREBASE_API_KEY`)
5. Cole o **valor** (do seu arquivo `.env` local)
6. Selecione os ambientes: **Production**, **Preview**, **Development**
7. Clique em **Save**
8. Repita para cada variável

## ⚠️ Importante

- **NÃO** commite o arquivo `.env` (já está no `.gitignore`)
- Use os **mesmos valores** do seu `.env` local
- Configure para **todos os ambientes** (Production, Preview, Development)

## 🔍 Onde Obter os Valores

### Firebase
1. Acesse [Firebase Console](https://console.firebase.google.com)
2. Selecione seu projeto
3. Vá em **Project Settings** > **General**
4. Role até **Your apps** e copie os valores do objeto `firebaseConfig`

### Gemini API
1. Acesse [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Crie uma nova API key ou copie uma existente

---

**Depois de adicionar todas as variáveis, faça um novo deploy!** 🚀

