# 🔑 Variáveis de Ambiente para Vercel

Copie e cole estas variáveis no painel do Vercel em **Settings > Environment Variables**.

## 📋 Lista Completa de Variáveis

Adicione cada uma dessas variáveis no Vercel:

### Firebase (✅ Já configuradas)
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

### IA/API (✅ Já configuradas)
```
VITE_GEMINI_API_KEY
VITE_GROQ_API_KEY
VITE_AI_API_URL
VITE_USE_AI_SERVER
```

### Mercado Pago (⚠️ FALTANDO - Adicione agora!)
```
VITE_MERCADOPAGO_PUBLIC_KEY_PROD=APP_USR-9e9eac57-183f-496f-9d20-536fa16ae5f1
VITE_MERCADOPAGO_ACCESS_TOKEN_PROD=APP_USR-3743437950896305-112812-559fadd346072c35f8cb81e21d4e562d-2583165550
VITE_MERCADOPAGO_CLIENT_ID=3743437950896305
VITE_MERCADOPAGO_CLIENT_SECRET=ctBrwFuNCvqHiVal1KqAt3hpgf1fyXXO
VITE_MERCADOPAGO_ENV=prod
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

### Groq API
1. Acesse [Groq Console](https://console.groq.com/keys)
2. Crie uma nova API key ou copie uma existente
3. Usado como fallback automático quando Gemini atinge quota

### Mercado Pago
As credenciais do Mercado Pago já estão no arquivo `.env` local. Use os mesmos valores para adicionar no Vercel:
- `VITE_MERCADOPAGO_PUBLIC_KEY_PROD`
- `VITE_MERCADOPAGO_ACCESS_TOKEN_PROD`
- `VITE_MERCADOPAGO_CLIENT_ID`
- `VITE_MERCADOPAGO_CLIENT_SECRET`
- `VITE_MERCADOPAGO_ENV`

---

## ⚠️ Variáveis Faltando no Vercel

Baseado na sua configuração atual, você precisa adicionar estas 5 variáveis do Mercado Pago:

1. **VITE_MERCADOPAGO_PUBLIC_KEY_PROD** = `APP_USR-9e9eac57-183f-496f-9d20-536fa16ae5f1`
2. **VITE_MERCADOPAGO_ACCESS_TOKEN_PROD** = `APP_USR-3743437950896305-112812-559fadd346072c35f8cb81e21d4e562d-2583165550`
3. **VITE_MERCADOPAGO_CLIENT_ID** = `3743437950896305`
4. **VITE_MERCADOPAGO_CLIENT_SECRET** = `ctBrwFuNCvqHiVal1KqAt3hpgf1fyXXO`
5. **VITE_MERCADOPAGO_ENV** = `prod`

**Depois de adicionar todas as variáveis, faça um novo deploy!** 🚀






