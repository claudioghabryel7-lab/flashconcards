# 🔐 Como Atualizar as Regras do Firestore

## ⚠️ SITUAÇÃO ATUAL

Suas regras estão **COMPLETAMENTE ABERTAS**:
```javascript
allow read, write: if true;  // ❌ Qualquer pessoa pode fazer TUDO
```

Isso significa que **qualquer pessoa** pode:
- Ver dados de todos os usuários
- Modificar/deletar flashcards
- Acessar chats de outros
- Ver senhas hasheadas
- Fazer qualquer coisa no banco

## ✅ SOLUÇÃO

Atualize para as regras seguras que já estão no arquivo `firestore.rules`.

## 📋 PASSO A PASSO

### 1. Acesse o Firebase Console
1. Vá para: https://console.firebase.google.com
2. Selecione seu projeto: **plegi-d84c2** (ou o nome do seu projeto)

### 2. Vá para Firestore Database
1. No menu lateral, clique em **"Firestore Database"**
2. Clique na aba **"Regras"** (Rules) no topo

### 3. Copie as Novas Regras
Abra o arquivo `firestore.rules` neste projeto e copie TODO o conteúdo.

### 4. Cole no Firebase Console
1. Cole as novas regras no editor
2. Clique em **"Publicar"** (Publish)

### 5. Pronto! ✅
As regras seguras estarão ativas.

## 🔍 VERIFICAÇÃO

Depois de publicar, você verá:
- ✅ Regras com `request.auth.uid` (validação de identidade)
- ✅ Proteção por usuário
- ✅ Apenas admin pode gerenciar flashcards
- ✅ Dados privados por usuário

## ⚠️ IMPORTANTE

**Após atualizar as regras:**
- Usuários antigos (sem Firebase Auth) não conseguirão mais acessar
- Você precisa criar contas no Firebase Authentication para eles
- OU migrar os dados existentes

## 🚨 SE ALGO PARAR DE FUNCIONAR

Se após atualizar as regras algo parar de funcionar:
1. Verifique se o Firebase Authentication está habilitado
2. Verifique se os usuários têm contas no Firebase Auth
3. Verifique os logs de erro no console do navegador








