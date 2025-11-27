# 🔧 Solução para Problema de Login

## ❌ ERROS ENCONTRADOS

1. **API Key Inválida**: `auth/api-key-not-valid`
2. **Permissões do Firestore**: `Missing or insufficient permissions`

## ✅ SOLUÇÃO PASSO A PASSO

### 1. Verificar/Criar Arquivo .env

Crie um arquivo `.env` na raiz do projeto com:

```env
VITE_FIREBASE_API_KEY=sua-api-key-aqui
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-project-id
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu-sender-id
VITE_FIREBASE_APP_ID=seu-app-id
```

**Onde encontrar essas informações:**
1. Acesse: https://console.firebase.google.com
2. Selecione seu projeto
3. Clique no ícone de engrenagem ⚙️ → "Configurações do projeto"
4. Role até "Seus apps" → Se não tiver app web, clique em "</>" para criar
5. Copie as configurações

### 2. Habilitar Firebase Authentication

1. No Firebase Console, vá em **"Authentication"**
2. Clique em **"Começar"** (Get started)
3. Vá em **"Sign-in method"** (Métodos de login)
4. Clique em **"Email/Password"**
5. **Ative** e clique em **"Salvar"**

### 3. Habilitar Identity Toolkit API (se necessário)

Se ainda der erro de API key:

1. Acesse: https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com
2. Selecione seu projeto
3. Clique em **"ATIVAR"** (Enable)

### 4. Criar Conta no Firebase Auth

**IMPORTANTE:** Agora você precisa criar a conta no Firebase Authentication, não mais no Firestore diretamente.

**Opção A - Pelo Admin Panel:**
1. Faça login como admin (se já tiver conta)
2. Vá em Admin → Criar novo usuário
3. O sistema criará automaticamente no Firebase Auth

**Opção B - Pelo Firebase Console:**
1. Firebase Console → Authentication → Users
2. Clique em "Adicionar usuário"
3. Digite email e senha
4. Depois, no Firestore, crie o documento em `users/{uid}` com:
   ```json
   {
     "uid": "uid-do-firebase-auth",
     "email": "email@exemplo.com",
     "displayName": "Nome",
     "role": "admin",
     "favorites": []
   }
   ```

### 5. Reiniciar o Servidor

Após criar o `.env`:
```bash
# Pare o servidor (Ctrl+C)
# Inicie novamente
npm run dev
```

## 🔍 VERIFICAÇÃO

Após seguir os passos:
1. ✅ Arquivo `.env` criado com todas as variáveis
2. ✅ Firebase Authentication habilitado
3. ✅ Identity Toolkit API ativada
4. ✅ Conta criada no Firebase Auth
5. ✅ Servidor reiniciado

## ⚠️ IMPORTANTE

**Se você tinha usuários no sistema antigo:**
- Eles precisam criar novas contas no Firebase Authentication
- OU você precisa migrar manualmente criando contas para eles





