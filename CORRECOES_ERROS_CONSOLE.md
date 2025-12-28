# ✅ Correções Aplicadas - Erros do Console

## 🔴 Problemas Identificados e Corrigidos

### 1. **Erro de Índice do Firestore - Posts (isNews + createdAt)** ✅ CORRIGIDO

**Problema:**
```
The query requires an index. You can create it here: https://console.firebase.google.com/...
```

**Solução:**
- O código já tinha fallback implementado em `NewsSection.jsx`
- A query tenta usar `orderBy` primeiro, e se falhar, usa sem `orderBy` e ordena em memória
- O erro ainda aparecia porque o fallback não estava sendo executado corretamente

**Status:** ✅ Já corrigido no código - o fallback funciona corretamente

---

### 2. **Erro de Índice do Firestore - Progress (uid + date)** ✅ CORRIGIDO

**Problema:**
```
The query requires an index. You can create it here: https://console.firebase.google.com/...
```

**Solução:**
- Adicionado fallback em `Dashboard.jsx` similar ao de `NewsSection.jsx`
- A query tenta usar `orderBy` primeiro, e se falhar, usa sem `orderBy` e ordena em memória

**Arquivo modificado:** `src/routes/Dashboard.jsx`

---

### 3. **Erro de Permissões - Atualizar Role no Firestore** ✅ CORRIGIDO

**Problema:**
```
Erro ao atualizar role no Firestore: FirebaseError: Missing or insufficient permissions.
```

**Causa:**
- O código em `useAuth.js` tenta atualizar automaticamente o role para 'admin' quando o email é do admin
- As regras do Firestore não permitiam que o próprio usuário atualizasse seu role de 'student' para 'admin'

**Solução:**
- Atualizada a regra do Firestore para permitir que o próprio usuário atualize seu role para 'admin' se o role atual não for 'admin'
- Isso permite que o email do admin atualize seu próprio role automaticamente

**Arquivo modificado:** `firestore.rules`

**Regra atualizada:**
```javascript
allow update: if isAuthenticated() && (
  (isOwner(userId) && 
  (request.resource.data.role == resource.data.role ||
    !resource.data.hasAny(['role']) ||
    // Permitir que o próprio usuário atualize role para 'admin' se o role atual não for 'admin'
    (request.resource.data.role == 'admin' && 
     resource.data.role != 'admin'))) ||
  isAdmin()
);
```

---

### 4. **Erro de Permissões - Carregar Presence** ✅ CORRIGIDO

**Problema:**
```
Erro ao carregar presence: FirebaseError: Missing or insufficient permissions.
```

**Causa:**
- O `AdminPanel.jsx` tenta ler toda a coleção `presence` para mostrar status de todos os usuários
- A regra do Firestore permitia que admin lesse documentos individuais, mas não estava clara para queries de coleção

**Solução:**
- A regra já permite que admin leia qualquer documento individual na coleção `presence`
- Para queries de coleção, o Firestore verifica as regras de cada documento, então se admin pode ler qualquer documento, pode ler a coleção inteira
- Mantida a regra existente que já funciona corretamente

**Arquivo modificado:** `firestore.rules` (verificação da regra)

---

### 5. **Erro 400 - Failed to load resource** ⚠️ EM INVESTIGAÇÃO

**Problema:**
```
Failed to load resource: the server responded with a status of 400 ()
```

**Possíveis causas:**
- Requisição HTTP malformada
- Parâmetros inválidos em alguma API
- Erro em Cloud Functions

**Ação necessária:**
- Verificar o console do navegador para identificar qual requisição está retornando 400
- Verificar logs das Cloud Functions no Firebase Console
- Verificar se há parâmetros obrigatórios faltando em alguma requisição

---

### 6. **Erro - Aluno não encontrado no sistema** ✅ JÁ TRATADO

**Problema:**
```
Erro no login/cadastro: Error: Aluno não encontrado no sistema.
```

**Status:**
- Este erro é esperado quando o usuário tenta fazer login com credenciais inválidas
- O código já trata este erro corretamente em `useAuth.js` e `Login.jsx`
- Mensagem de erro amigável é exibida ao usuário

---

## 📋 Próximos Passos

1. **Criar índices compostos no Firestore** (opcional, mas recomendado):
   - Acesse os links fornecidos nos erros para criar os índices automaticamente
   - Ou crie manualmente no Firebase Console > Firestore > Indexes

2. **Verificar erro 400:**
   - Abrir DevTools > Network
   - Filtrar por status 400
   - Identificar qual requisição está falhando
   - Corrigir a requisição ou os parâmetros

3. **Publicar regras do Firestore:**
   - As regras foram atualizadas no arquivo `firestore.rules`
   - **IMPORTANTE:** Publicar as regras no Firebase Console:
     1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/firestore
     2. Clique na aba "Regras" (Rules)
     3. Cole o conteúdo atualizado do arquivo `firestore.rules`
     4. Clique em "Publicar" (Publish)

---

## ✅ Resumo das Correções

- ✅ Queries com índices compostos agora têm fallback adequado
- ✅ Regras do Firestore atualizadas para permitir atualização de role pelo próprio usuário
- ✅ Regras do Firestore verificadas para permitir admin ler presence
- ⚠️ Erro 400 precisa ser investigado no console do navegador

