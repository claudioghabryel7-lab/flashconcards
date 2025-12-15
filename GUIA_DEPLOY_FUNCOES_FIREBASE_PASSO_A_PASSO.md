# 🚀 Guia Completo: Deploy de Funções Firebase - Passo a Passo

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter:

1. ✅ Node.js instalado (versão 18 ou superior)
2. ✅ Conta Google/Firebase configurada
3. ✅ Projeto Firebase criado
4. ✅ Firebase CLI instalado

---

## 🔧 Passo 1: Verificar Instalação do Firebase CLI

Abra o terminal (PowerShell) e verifique se o Firebase CLI está instalado:

```powershell
firebase --version
```

**Se não estiver instalado**, instale globalmente:

```powershell
npm install -g firebase-tools
```

---

## 🔐 Passo 2: Fazer Login no Firebase

Autentique-se na sua conta Firebase:

```powershell
firebase login
```

Isso abrirá o navegador para você fazer login com sua conta Google.

**Verifique se está logado:**

```powershell
firebase login:list
```

---

## 📁 Passo 3: Verificar Projeto Firebase

Certifique-se de estar no diretório raiz do projeto:

```powershell
cd "C:\Users\Ghabryel Concurseiro\flashconcards"
```

**Verificar qual projeto está configurado:**

```powershell
firebase projects:list
```

**Se precisar definir o projeto:**

```powershell
firebase use plegi-d84c2
```

Ou use o comando interativo:

```powershell
firebase use --add
```

---

## 📦 Passo 4: Instalar Dependências das Funções

Entre na pasta `functions` e instale as dependências:

```powershell
cd functions
npm install
cd ..
```

**Verificar se tudo está OK:**

```powershell
cd functions
npm list --depth=0
cd ..
```

---

## ⚙️ Passo 5: Configurar Variáveis de Ambiente (Opcional)

Se suas funções precisam de variáveis de ambiente (como credenciais de email), configure-as:

```powershell
firebase functions:config:set email.user="seu-email@gmail.com"
firebase functions:config:set email.password="sua-senha-app"
```

**Para ver as configurações atuais:**

```powershell
firebase functions:config:get
```

---

## 🚀 Passo 6: Fazer o Deploy das Funções

Agora você pode fazer o deploy! Execute no diretório raiz:

```powershell
firebase deploy --only functions
```

**Ou para fazer deploy de uma função específica:**

```powershell
firebase deploy --only functions:createUserAndSendEmail
firebase deploy --only functions:webhookMercadoPago
```

---

## 📊 Passo 7: Verificar o Deploy

Após o deploy, você verá URLs como estas:

```
✔  functions[createUserAndSendEmail(us-central1)] Successful create operation.
Function URL (createUserAndSendEmail): https://us-central1-plegi-d84c2.cloudfunctions.net/createUserAndSendEmail

✔  functions[webhookMercadoPago(us-central1)] Successful create operation.
Function URL (webhookMercadoPago): https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
```

**Anote essas URLs!** Você precisará delas para configurar o webhook do Mercado Pago.

---

## 🔍 Passo 8: Verificar Logs das Funções

Para ver os logs em tempo real:

```powershell
firebase functions:log
```

**Ou para ver logs de uma função específica:**

```powershell
firebase functions:log --only createUserAndSendEmail
```

---

## 🧪 Passo 9: Testar as Funções

### Testar createUserAndSendEmail:

```powershell
# Usando curl (se tiver instalado) ou PowerShell
Invoke-WebRequest -Uri "https://us-central1-plegi-d84c2.cloudfunctions.net/createUserAndSendEmail" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"email":"teste@exemplo.com","password":"senha123","name":"Teste"}'
```

### Testar webhookMercadoPago:

Você pode testar diretamente no console do Mercado Pago configurando a URL do webhook.

---

## 🔄 Passo 10: Atualizar Funções (Re-deploy)

Sempre que fizer alterações em `functions/index.js`, faça o deploy novamente:

```powershell
firebase deploy --only functions
```

---

## ❌ Solução de Problemas Comuns

### Erro: "Cannot find module 'lodash/defaults'"

**Solução:**

```powershell
npm uninstall -g firebase-tools
npm install -g firebase-tools@latest
```

### Erro: "Permission denied"

**Solução:**

```powershell
firebase logout
firebase login
```

### Erro: "Project not found"

**Solução:**

```powershell
firebase use --add
# Selecione o projeto correto: plegi-d84c2
```

### Erro: "Node version mismatch"

**Solução:**

O `firebase.json` está configurado para Node 20, mas o `package.json` das funções especifica Node 18. Atualize o `package.json`:

```json
"engines": {
  "node": "20"
}
```

Ou use Node 18:

```powershell
# Se tiver nvm instalado
nvm install 18
nvm use 18
```

---

## 📝 Checklist Final

Antes de considerar o deploy completo, verifique:

- [ ] Firebase CLI instalado e funcionando
- [ ] Login no Firebase realizado
- [ ] Projeto Firebase selecionado corretamente
- [ ] Dependências instaladas (`npm install` na pasta functions)
- [ ] Variáveis de ambiente configuradas (se necessário)
- [ ] Deploy executado com sucesso
- [ ] URLs das funções anotadas
- [ ] Funções testadas e funcionando
- [ ] Logs verificados

---

## 🎯 Próximos Passos Após o Deploy

1. **Configurar Webhook do Mercado Pago:**
   - Use a URL: `https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago`
   - Configure no painel do Mercado Pago

2. **Atualizar Frontend:**
   - Use a URL da função `createUserAndSendEmail` no código do frontend
   - Atualize as chamadas de API

3. **Monitorar Funções:**
   - Acesse: https://console.firebase.google.com/project/plegi-d84c2/functions
   - Monitore uso, erros e logs

---

## 📚 Recursos Úteis

- **Firebase Console:** https://console.firebase.google.com/project/plegi-d84c2
- **Documentação Firebase Functions:** https://firebase.google.com/docs/functions
- **Logs em Tempo Real:** `firebase functions:log`

---

## ✅ Comandos Rápidos (Resumo)

```powershell
# 1. Login
firebase login

# 2. Selecionar projeto
firebase use plegi-d84c2

# 3. Instalar dependências
cd functions
npm install
cd ..

# 4. Deploy
firebase deploy --only functions

# 5. Ver logs
firebase functions:log
```

---

**Pronto! Suas funções Firebase estão deployadas! 🎉**








































