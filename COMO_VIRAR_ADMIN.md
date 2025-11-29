# 👑 Como Virar Admin - Solução Rápida

## ❌ PROBLEMA
Você está logado mas aparece como "Aluno" ao invés de "Admin".

## ✅ SOLUÇÃO MAIS RÁPIDA (2 minutos)

### Passo 1: Encontrar seu UID

1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/authentication/users
2. Procure seu email: `claudioghabryel.cg@gmail.com`
3. **Copie o UID** (é uma string longa tipo: `abc123xyz456...`)

### Passo 2: Atualizar no Firestore

1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/firestore
2. Clique em **"users"** (coleção)
3. Procure o documento com o **ID = seu UID** (que você copiou)
4. Clique no documento
5. Encontre o campo **"role"**
6. Mude de `"student"` para `"admin"`
7. Clique em **"Atualizar"**

### Passo 3: Recarregar a página

Recarregue a página do site (F5) e você aparecerá como **Admin**! 🎉

## 🔍 ESTRUTURA DO DOCUMENTO

O documento deve ter:
```json
{
  "uid": "seu-uid-aqui",
  "email": "claudioghabryel.cg@gmail.com",
  "displayName": "Claudio Ghabryel",
  "role": "admin",  // ← MUDE PARA "admin"
  "favorites": []
}
```

## ✅ VERIFICAÇÃO

Após atualizar:
- ✅ Aparecerá como "Admin" no header
- ✅ Verá o link "Admin" no menu
- ✅ Poderá acessar `/admin`









