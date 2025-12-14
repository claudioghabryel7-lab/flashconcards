# 🔒 Análise das Regras do Firestore

## ✅ Pontos Corretos

1. **Funções auxiliares** bem implementadas (`isAuthenticated`, `isOwner`, `isAdmin`)
2. **Proteção de dados sensíveis** - usuários só podem modificar seus próprios dados
3. **Regra catch-all** no final bloqueando acesso não especificado
4. **Verificações de admin** expandidas onde necessário

---

## ⚠️ Problemas Encontrados

### 🔴 **CRÍTICO: Transações de Pagamento Muito Permissivas**

**Linhas 278-298:**
```javascript
match /transactions/{transactionId} {
  allow create: if true;  // ❌ Qualquer pessoa pode criar
  allow read: if true;     // ❌ Qualquer pessoa pode ler TODAS as transações
  allow update: if true;   // ❌ Qualquer pessoa pode atualizar QUALQUER transação
  allow delete: if isAdmin();
}
```

**Problemas:**
- ❌ Qualquer pessoa pode ver TODAS as transações (incluindo dados de pagamento de outros)
- ❌ Qualquer pessoa pode modificar transações de outros
- ❌ Risco de exposição de dados financeiros sensíveis

**Solução:** Restringir leitura/atualização apenas para o dono da transação ou admin

---

### 🟡 **MÉDIO: Cache Permite Qualquer Autenticado Criar/Atualizar**

**Linhas 249-276:**
```javascript
match /questoesCache/{cacheId} {
  allow read: if isAuthenticated();
  allow create, update: if isAuthenticated(); // ⚠️ Qualquer autenticado pode criar/atualizar
  allow delete: if isAdmin();
}
```

**Problema:**
- ⚠️ Qualquer usuário autenticado pode criar/atualizar cache
- ⚠️ Risco de cache corrompido ou malicioso
- ⚠️ Pode causar problemas de integridade de dados

**Solução:** Restringir criação/atualização apenas para admin ou validar dados antes

---

### 🟡 **MÉDIO: Posts - Leitura Pode Falhar se resource.data Não Existir**

**Linha 305:**
```javascript
allow read: if resource.data.isNews == true || isAuthenticated();
```

**Problema:**
- ⚠️ Se `resource.data` não existir (documento novo), pode causar erro
- ⚠️ Deveria verificar se `resource.data` existe primeiro

**Solução:** Adicionar verificação de existência

---

### 🟡 **MÉDIO: sharedSimulados - Regra de Update Complexa e Possivelmente Vulnerável**

**Linhas 350-356:**
```javascript
allow update: if (isAdmin() || 
  (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['attempts']) ||
   request.resource.data.diff(resource.data).affectedKeys().hasOnly(['questions']) ||
   request.resource.data.diff(resource.data).affectedKeys().hasOnly(['attempts', 'questions'])));
```

**Problemas:**
- ⚠️ Qualquer pessoa autenticada pode atualizar `attempts` e `questions`
- ⚠️ Não verifica se a pessoa tem permissão para atualizar aquele simulado específico
- ⚠️ Pode permitir que pessoas modifiquem simulados de outros

**Solução:** Adicionar verificação de propriedade ou token de acesso

---

### 🟢 **BAIXO: users - Leitura Muito Permissiva**

**Linha 22:**
```javascript
allow read: if isAuthenticated() || (request.auth != null && request.auth.uid == userId);
```

**Problema:**
- 🟢 Qualquer usuário autenticado pode ler dados de outros usuários
- 🟢 Pode expor informações sensíveis (email, etc.)

**Nota:** Se isso é intencional para ranking, está OK, mas considere limitar campos públicos

---

## 🔧 Correções Recomendadas

### 1. **Corrigir Transações (CRÍTICO)**

```javascript
match /transactions/{transactionId} {
  // Permitir criação pública (checkout sem login)
  allow create: if true;
  
  // Leitura: apenas dono da transação (por email ou userId) ou admin
  allow read: if isAuthenticated() && (
    resource.data.userId == request.auth.uid ||
    resource.data.email == request.auth.token.email ||
    isAdmin()
  ) || (!isAuthenticated() && resource.data.transactionId == transactionId);
  
  // Atualização: apenas dono ou admin
  allow update: if isAuthenticated() && (
    resource.data.userId == request.auth.uid ||
    resource.data.email == request.auth.token.email ||
    isAdmin()
  );
  
  allow delete: if isAdmin();
}
```

### 2. **Corrigir Cache (MÉDIO)**

```javascript
match /questoesCache/{cacheId} {
  allow read: if isAuthenticated();
  // Apenas admin pode criar/atualizar (ou validar dados antes)
  allow create, update: if isAdmin();
  allow delete: if isAdmin();
}
```

### 3. **Corrigir Posts (MÉDIO)**

```javascript
allow read: if (resource != null && resource.data != null && resource.data.isNews == true) || isAuthenticated();
```

### 4. **Melhorar sharedSimulados (MÉDIO)**

Adicionar validação de token ou verificação de propriedade antes de permitir update.

---

## 📊 Resumo de Segurança

| Coleção | Leitura | Criação | Atualização | Status |
|---------|---------|---------|------------|--------|
| users | ⚠️ Muito permissiva | ✅ OK | ✅ OK | 🟡 |
| transactions | 🔴 **CRÍTICO** | ⚠️ OK (checkout público) | 🔴 **CRÍTICO** | 🔴 |
| cache | ✅ OK | ⚠️ Muito permissiva | ⚠️ Muito permissiva | 🟡 |
| posts | ⚠️ Pode falhar | ✅ OK | ✅ OK | 🟡 |
| sharedSimulados | ✅ OK | ✅ OK | ⚠️ Vulnerável | 🟡 |

---

## ✅ Recomendações Finais

1. **URGENTE:** Corrigir regras de `transactions` - risco de exposição de dados financeiros
2. **IMPORTANTE:** Restringir criação/atualização de cache apenas para admin
3. **IMPORTANTE:** Adicionar verificação de existência em `posts`
4. **MELHORIA:** Considerar limitar campos públicos em `users` para ranking

