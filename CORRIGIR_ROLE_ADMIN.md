# 🔧 CORREÇÃO URGENTE - Role Admin

## ⚠️ PROBLEMA
O documento do usuário no Firestore **não tem o campo `role`** ou está como `undefined`. Isso causa:
- Carregamento infinito
- Erros de permissão
- Sistema não reconhece como admin

## ✅ SOLUÇÃO (3 minutos)

**IMPORTANTE:** Faça os passos na ordem!

### Passo 1: Atualizar Regras do Firestore (PRIMEIRO!)
1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/firestore
2. Clique na aba **"Regras" (Rules)**
3. Abra o arquivo `firestore.rules` do seu projeto no editor
4. **Substitua TODO o conteúdo** pelas novas regras (já atualizadas no código)
5. Clique em **"Publicar" (Publish)**

### Passo 2: Encontrar seu UID
1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/authentication/users
2. Procure: `claudioghabryel.cg@gmail.com`
3. **Copie o UID** (string longa)

### Passo 3: Atualizar no Firestore
1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/firestore/data
2. Clique em **"users"** (coleção)
3. Procure o documento com **ID = seu UID**
4. Clique no documento
5. **Verifique se existe o campo `role`**
   - Se **NÃO existir**: Clique em **"Adicionar campo"** → Nome: `role`, Tipo: `string`, Valor: `admin`
   - Se **existir mas for `student` ou `undefined`**: Clique no campo → Delete o valor → Digite: `admin`
6. Clique em **"Atualizar"** (Update)

### Passo 4: Verificar
O documento deve ter:
```json
{
  "uid": "seu-uid-aqui",
  "email": "claudioghabryel.cg@gmail.com",
  "displayName": "Claudio Ghabryel",
  "role": "admin",  // ← DEVE SER "admin" (não undefined, não student)
  "favorites": []
}
```

### Passo 4: Atualizar Regras do Firestore
1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/firestore
2. Clique na aba **"Regras" (Rules)**
3. Abra o arquivo `firestore.rules` do seu projeto
4. **Substitua TODO o conteúdo** pelas novas regras (já atualizadas no código)
5. Clique em **"Publicar" (Publish)**

### Passo 5: Recarregar
1. Recarregue a página (F5)
2. O carregamento deve parar
3. Você deve aparecer como "Admin" permanentemente

## 🎯 POR QUE ISSO ACONTECE?

O código tenta atualizar automaticamente, mas se o documento não existir ou não tiver o campo `role`, as regras de segurança do Firestore bloqueiam a atualização. Atualizando manualmente no console, garantimos que o campo existe e está correto.

