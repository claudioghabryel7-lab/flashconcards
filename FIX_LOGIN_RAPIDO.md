# 🚀 CORREÇÃO RÁPIDA - Problema de Login

## ❌ ERRO ATUAL
```
auth/api-key-not-valid
Missing or insufficient permissions
```

## ✅ SOLUÇÃO EM 3 PASSOS

### PASSO 1: Criar arquivo .env

Crie um arquivo chamado `.env` na raiz do projeto (mesma pasta do `package.json`) com:

```env
VITE_FIREBASE_API_KEY=SUA_API_KEY_AQUI
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-project-id
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu-sender-id
VITE_FIREBASE_APP_ID=seu-app-id
```

**Onde pegar essas informações:**
1. Acesse: https://console.firebase.google.com
2. Seu projeto → ⚙️ Configurações → "Seus apps"
3. Se não tiver app web, clique em "</>" para criar
4. Copie as configurações e cole no `.env`

### PASSO 2: Habilitar Firebase Authentication

1. Firebase Console → **Authentication**
2. Clique em **"Começar"** (Get started)
3. Aba **"Sign-in method"**
4. Clique em **"Email/Password"**
5. **Ative** e **Salve**

### PASSO 3: Criar sua conta de admin

**Opção A - Pelo Firebase Console (MAIS RÁPIDO):**
1. Firebase Console → Authentication → Users
2. Clique em **"Adicionar usuário"**
3. Email: `claudioghabryel.cg@gmail.com`
4. Senha: (sua senha)
5. Clique em **"Adicionar"**

Depois, no Firestore:
1. Vá em Firestore Database
2. Coleção `users` → Adicione documento com ID = `uid` (pegue do Authentication)
3. Dados:
   ```json
   {
     "uid": "uid-do-firebase-auth",
     "email": "claudioghabryel.cg@gmail.com",
     "displayName": "Claudio Ghabryel",
     "role": "admin",
     "favorites": []
   }
   ```

**Opção B - Pelo código (se conseguir acessar admin):**
1. Acesse `/admin` (se já tiver acesso)
2. Crie usuário pelo painel admin
3. O sistema criará automaticamente no Firebase Auth

### PASSO 4: Reiniciar servidor

```bash
# Pare o servidor (Ctrl+C no terminal)
# Inicie novamente
npm run dev
```

## ✅ PRONTO!

Agora você consegue fazer login normalmente!






