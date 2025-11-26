# 🔧 Atualizar Role para Admin no Firestore

## ⚠️ PROBLEMA
O role aparece como "admin" e some rapidamente porque o documento no Firestore ainda tem `role: 'student'`.

## ✅ SOLUÇÃO DEFINITIVA (2 minutos)

### Passo 1: Encontrar seu UID

1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/authentication/users
2. Procure: `claudioghabryel.cg@gmail.com`
3. **Copie o UID** (string longa)

### Passo 2: Atualizar no Firestore

1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/firestore/data
2. Clique em **"users"** (coleção)
3. Procure o documento com **ID = seu UID**
4. Clique no documento
5. Encontre o campo **"role"**
6. **DELETE o valor atual** (`student`)
7. Digite: `admin`
8. Clique em **"Atualizar"** (Update)

### Passo 3: Verificar

O documento deve ter:
```json
{
  "uid": "seu-uid",
  "email": "claudioghabryel.cg@gmail.com",
  "displayName": "Claudio Ghabryel",
  "role": "admin",  // ← DEVE SER "admin"
  "favorites": []
}
```

### Passo 4: Recarregar

Recarregue a página (F5) - agora deve aparecer como Admin permanentemente!

## 🎯 POR QUE ISSO ACONTECE?

O código tenta atualizar automaticamente, mas o `onSnapshot` (sincronização em tempo real) pode estar lendo o valor antigo antes da atualização ser concluída. Atualizando diretamente no Firestore, garantimos que o valor correto está salvo.

