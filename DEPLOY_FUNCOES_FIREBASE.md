# 🚀 Como Fazer Deploy das Funções Firebase

## ⚠️ Problema no Firebase Tools

Há um erro com o `firebase-tools` no seu sistema. Use uma das opções abaixo:

---

## 📋 Opção 1: Deploy via Firebase Console (Mais Fácil)

### 1. Acesse o Firebase Console:
https://console.firebase.google.com/project/plegi-d84c2/functions

### 2. Ative Cloud Functions:
- Se ainda não estiver ativado, clique em "Get Started"
- Aceite os termos

### 3. Instale Firebase CLI globalmente (se não tiver):
```bash
npm install -g firebase-tools@latest
```

### 4. Tente fazer login novamente:
```bash
firebase login
```

### 5. Deploy das funções:
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

---

## 📋 Opção 2: Corrigir Firebase Tools

O erro `Cannot find module 'lodash/defaults'` pode ser corrigido:

### 1. Reinstalar firebase-tools:
```bash
npm uninstall -g firebase-tools
npm install -g firebase-tools@latest
```

### 2. Ou instalar lodash globalmente:
```bash
npm install -g lodash
```

---

## 📋 Opção 3: Usar NVM (Node Version Manager)

O erro pode ser por incompatibilidade de versão do Node:

```bash
# Instalar NVM (se não tiver)
# Windows: https://github.com/coreybutler/nvm-windows

# Usar Node 18 (versão recomendada pelo Firebase Functions)
nvm install 18
nvm use 18

# Depois tentar deploy novamente
cd functions
npm install
cd ..
firebase deploy --only functions
```

---

## 📋 Opção 4: Deploy Manual via Código

Se nada funcionar, você pode:

1. Copiar o código de `functions/index.js`
2. Criar função diretamente no Firebase Console
3. Colar o código lá

---

## ✅ Status Atual

- ✅ **Frontend**: Será deployado automaticamente pela Vercel
- ⚠️ **Functions**: Precisa fazer deploy manualmente

---

## 🎯 Alternativa Temporária

Enquanto o deploy das funções não funciona, o sistema ainda vai:
- ✅ Criar contas automaticamente (via fallback no frontend)
- ⚠️ Enviar email (só funcionará após deploy da função)

Mas a criação de conta já está funcionando sem precisar da função!

---

## 📞 Próximos Passos

1. Tente corrigir o firebase-tools usando uma das opções acima
2. Ou aguarde e faça deploy via Firebase Console quando estiver no ar
3. O frontend já está sendo deployado automaticamente pela Vercel

---

**Frontend já está no ar via Vercel! 🎉**









































