# 🚀 Guia Completo: Deploy e Configuração - Passo a Passo

## 📋 O que vamos fazer:

1. ✅ Fazer deploy das funções Firebase
2. ✅ Anotar as URLs das funções
3. ✅ Configurar webhook no Mercado Pago
4. ✅ Verificar se o código do frontend está correto

---

## 🔧 PASSO 1: Fazer Deploy das Funções Firebase

### Opção A: Usar o Script Automatizado (Mais Fácil)

1. **Abra o PowerShell** (botão direito no Windows > Windows PowerShell)

2. **Navegue até a pasta do projeto:**
   ```powershell
   cd "C:\Users\Ghabryel Concurseiro\flashconcards"
   ```

3. **Execute o script:**
   ```powershell
   .\deploy-functions.ps1
   ```

4. **Siga as instruções na tela:**
   - Se pedir login, faça login no navegador que abrir
   - Aguarde o processo terminar

### Opção B: Fazer Manualmente

1. **Abra o PowerShell**

2. **Navegue até a pasta:**
   ```powershell
   cd "C:\Users\Ghabryel Concurseiro\flashconcards"
   ```

3. **Verifique se Firebase CLI está instalado:**
   ```powershell
   firebase --version
   ```
   Se não estiver, instale:
   ```powershell
   npm install -g firebase-tools
   ```

4. **Faça login:**
   ```powershell
   firebase login
   ```
   (Isso abrirá o navegador para você fazer login)

5. **Selecione o projeto:**
   ```powershell
   firebase use plegi-d84c2
   ```

6. **Instale dependências:**
   ```powershell
   cd functions
   npm install
   cd ..
   ```

7. **Faça o deploy:**
   ```powershell
   firebase deploy --only functions
   ```

---

## 📝 PASSO 2: Anotar as URLs das Funções

Após o deploy, você verá algo assim na tela:

```
✔  functions[createUserAndSendEmail(us-central1)] Successful create operation.
Function URL (createUserAndSendEmail): https://us-central1-plegi-d84c2.cloudfunctions.net/createUserAndSendEmail

✔  functions[webhookMercadoPago(us-central1)] Successful create operation.
Function URL (webhookMercadoPago): https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
```

### ✅ Anote essas duas URLs:

1. **URL da função createUserAndSendEmail:**
   ```
   https://us-central1-plegi-d84c2.cloudfunctions.net/createUserAndSendEmail
   ```

2. **URL da função webhookMercadoPago:**
   ```
   https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
   ```

**💡 Dica:** Copie e cole essas URLs em um bloco de notas para usar depois!

---

## 🔗 PASSO 3: Configurar Webhook no Mercado Pago

### 3.1 Acessar o Painel do Mercado Pago

1. **Acesse:** https://www.mercadopago.com.br/developers/panel
2. **Faça login** com sua conta do Mercado Pago
3. **Selecione sua aplicação** (ou crie uma nova se ainda não tiver)

### 3.2 Encontrar a Seção de Webhooks

1. No menu lateral, procure por **"Webhooks"** ou **"Notificações"**
2. Ou acesse diretamente: https://www.mercadopago.com.br/developers/panel/app/{SEU_APP_ID}/webhooks
   - (Substitua `{SEU_APP_ID}` pelo ID da sua aplicação)

### 3.3 Adicionar URL do Webhook

1. Clique no botão **"Adicionar URL"** ou **"Criar Webhook"**

2. **Cole a URL do webhook** (a que você anotou no Passo 2):
   ```
   https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
   ```

3. **Selecione os eventos** que deseja receber:
   - ✅ **payment** (quando um pagamento é criado)
   - ✅ **payment.updated** (quando o status de um pagamento muda)

4. **Clique em "Salvar"** ou **"Criar"**

5. O Mercado Pago testará a URL automaticamente
   - Se aparecer um erro, verifique se a função Firebase está deployada corretamente

---

## ✅ PASSO 4: Verificar Código do Frontend

O código já está configurado! Mas vamos verificar se está correto:

### 4.1 Verificar URL no Código

1. **Abra o arquivo:** `src/routes/Payment.jsx`

2. **Procure pela linha 209** (ou procure por `createUserAndSendEmail`)

3. **Verifique se a URL está correta:**
   ```javascript
   const response = await fetch('https://us-central1-plegi-d84c2.cloudfunctions.net/createUserAndSendEmail', {
   ```

4. **Se a URL for diferente** da que você anotou no Passo 2, **atualize**:
   - Substitua a URL antiga pela nova URL que você anotou

### 4.2 Se Precisar Atualizar

Se você precisar atualizar a URL no código:

1. Abra `src/routes/Payment.jsx`
2. Encontre a linha com `createUserAndSendEmail`
3. Substitua a URL pela URL correta que você anotou
4. Salve o arquivo

---

## 🧪 PASSO 5: Testar Tudo

### 5.1 Testar a Função createUserAndSendEmail

Você pode testar diretamente no navegador ou usando PowerShell:

**No PowerShell:**
```powershell
Invoke-WebRequest -Uri "https://us-central1-plegi-d84c2.cloudfunctions.net/createUserAndSendEmail" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"email":"teste@exemplo.com","password":"senha123","name":"Teste"}'
```

**Ou acesse no navegador:**
- A URL deve retornar um erro de método (isso é normal, significa que está funcionando)
- A função só aceita requisições POST

### 5.2 Testar o Webhook

1. Faça um pagamento de teste no Mercado Pago
2. Verifique os logs da função:
   ```powershell
   firebase functions:log
   ```
3. Verifique se a transação foi atualizada no Firestore

---

## 📊 PASSO 6: Monitorar as Funções

### Ver Logs em Tempo Real

```powershell
firebase functions:log
```

### Ver Logs de uma Função Específica

```powershell
firebase functions:log --only createUserAndSendEmail
firebase functions:log --only webhookMercadoPago
```

### Acessar Console do Firebase

Acesse: https://console.firebase.google.com/project/plegi-d84c2/functions

Aqui você pode:
- Ver todas as funções deployadas
- Ver estatísticas de uso
- Ver logs detalhados
- Ver erros e métricas

---

## ❌ Solução de Problemas

### Erro: "Cannot find module"

**Solução:**
```powershell
cd functions
npm install
cd ..
firebase deploy --only functions
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
# Selecione: plegi-d84c2
```

### Webhook não está recebendo notificações

1. Verifique se a URL está correta no Mercado Pago
2. Verifique se a função está deployada:
   ```powershell
   firebase functions:list
   ```
3. Teste a URL manualmente
4. Verifique os logs:
   ```powershell
   firebase functions:log --only webhookMercadoPago
   ```

### Função retorna erro 500

1. Verifique os logs:
   ```powershell
   firebase functions:log
   ```
2. Verifique se as variáveis de ambiente estão configuradas:
   ```powershell
   firebase functions:config:get
   ```
3. Se precisar configurar credenciais de email:
   ```powershell
   firebase functions:config:set email.user="seu-email@gmail.com"
   firebase functions:config:set email.password="sua-senha-app"
   ```

---

## ✅ Checklist Final

Antes de considerar tudo pronto, verifique:

- [ ] Funções deployadas com sucesso
- [ ] URLs das funções anotadas
- [ ] Webhook configurado no Mercado Pago
- [ ] URL no código do frontend está correta
- [ ] Teste de pagamento realizado
- [ ] Logs verificados
- [ ] Email de teste enviado com sucesso

---

## 🎯 Resumo Rápido

```powershell
# 1. Deploy
firebase deploy --only functions

# 2. Anotar URLs (aparecem na tela após deploy)

# 3. Configurar no Mercado Pago (via site)

# 4. Verificar código (já está correto!)

# 5. Testar
firebase functions:log
```

---

**Pronto! Agora você está com tudo configurado! 🎉**

Se tiver alguma dúvida ou erro, me avise que eu ajudo!











































