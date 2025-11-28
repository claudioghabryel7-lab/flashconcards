# 🔧 Como Corrigir: Aparecer como Admin

## ❌ PROBLEMA
Você está logado mas aparece como "Aluno" ao invés de "Admin".

## ✅ SOLUÇÃO RÁPIDA

### Opção 1: Atualizar no Firestore (MAIS RÁPIDO)

1. **Acesse o Firestore Console:**
   https://console.firebase.google.com/project/plegi-d84c2/firestore

2. **Vá para a coleção `users`**

3. **Encontre seu documento** (o ID é o UID do Firebase Authentication)
   - Se não souber o UID, vá em Authentication → Users → copie o UID do seu usuário

4. **Clique no documento e edite:**
   - Encontre o campo `role`
   - Mude de `student` para `admin`
   - Salve

5. **Recarregue a página** - você aparecerá como Admin!

### Opção 2: Usar o código (se tiver acesso admin)

Se você conseguir acessar `/admin` de alguma forma, pode atualizar pelo código.

### Opção 3: Criar script de atualização

Posso criar um script para você executar que atualiza automaticamente.

## 🔍 COMO ENCONTRAR SEU UID

1. Firebase Console → Authentication → Users
2. Procure seu email: `claudioghabryel.cg@gmail.com`
3. Copie o **UID** (é uma string longa)
4. Use esse UID como ID do documento em `users/{uid}`

## ✅ VERIFICAÇÃO

Após atualizar, verifique se o documento tem:
```json
{
  "uid": "seu-uid-aqui",
  "email": "claudioghabryel.cg@gmail.com",
  "displayName": "Claudio Ghabryel",
  "role": "admin",  // ← DEVE SER "admin"
  "favorites": []
}
```







