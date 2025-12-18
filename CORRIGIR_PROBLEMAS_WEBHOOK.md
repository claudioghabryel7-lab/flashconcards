# 🔧 Corrigir Problemas do Webhook - Passo a Passo

## 🚨 Problemas Identificados:

1. ❌ **URL do webhook está errada** no Mercado Pago (tem "https:// https://")
2. ❌ **Domínio não autorizado** no Firebase Auth (`www.hostinger.autos`)
3. ⚠️ **Erro de permissão** no Firestore (pode ser por não estar autenticado)

---

## ✅ SOLUÇÃO 1: Corrigir URL do Webhook no Mercado Pago

### Passo a Passo:

1. **Acesse:** https://www.mercadopago.com.br/developers/panel/app/3743437950896305/webhooks

2. **Clique em "Configurar notificações"** (botão azul)

3. **Remova a URL antiga** (se houver)

4. **Adicione a URL CORRETA** (sem duplo https://):
   ```
   https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
   ```
   ⚠️ **IMPORTANTE:** Copie exatamente assim, sem espaços antes ou depois!

5. **Selecione os eventos:**
   - ✅ `payment`
   - ✅ `payment.updated`

6. **Clique em "Salvar"**

7. **Aguarde o teste automático** - deve aparecer "URL válida" ou similar

---

## ✅ SOLUÇÃO 2: Adicionar Domínio ao Firebase Auth

### Passo a Passo:

1. **Acesse:** https://console.firebase.google.com/project/plegi-d84c2/authentication/settings

2. **Vá em "Authorized domains"** (Domínios autorizados)

3. **Clique em "Add domain"** (Adicionar domínio)

4. **Adicione:**
   ```
   www.hostinger.autos
   ```
   E também:
   ```
   hostinger.autos
   ```

5. **Clique em "Add"** (Adicionar)

6. **Salve as alterações**

---

## ✅ SOLUÇÃO 3: Verificar se a Função Está Funcionando

### Testar a URL do Webhook:

**No PowerShell:**
```powershell
Invoke-WebRequest -Uri "https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"type":"payment","data":{"id":"123","status":"approved"}}'
```

**Deve retornar:**
```json
{
  "received": true,
  "message": "Transação não encontrada"
}
```

Se retornar isso, a função está funcionando! ✅

---

## ✅ SOLUÇÃO 4: Verificar Logs da Função

Para ver se o webhook está recebendo requisições:

```powershell
firebase functions:log --only webhookMercadoPago
```

Ou ver todos os logs:
```powershell
firebase functions:log
```

---

## 🧪 Como Testar o Webhook Completo

### Opção 1: Teste Manual no Mercado Pago

1. No painel do Mercado Pago, vá em "Webhooks"
2. Procure por um botão "Testar" ou "Enviar notificação de teste"
3. Clique e verifique se aparece nos logs

### Opção 2: Criar Pagamento de Teste

1. Use as credenciais de TEST do Mercado Pago
2. Crie um pagamento de teste
3. Verifique se o webhook recebe a notificação

---

## 📋 Checklist de Correção

- [ ] URL do webhook corrigida no Mercado Pago (sem duplo https://)
- [ ] Domínio `www.hostinger.autos` adicionado ao Firebase Auth
- [ ] Domínio `hostinger.autos` adicionado ao Firebase Auth
- [ ] Teste da função webhook executado com sucesso
- [ ] Logs verificados
- [ ] Pagamento de teste realizado

---

## 🔍 Verificar se Está Funcionando

### 1. Ver Logs em Tempo Real:

```powershell
firebase functions:log --only webhookMercadoPago --follow
```

### 2. Verificar no Console do Firebase:

https://console.firebase.google.com/project/plegi-d84c2/functions/logs

### 3. Verificar no Mercado Pago:

No painel de webhooks, deve aparecer:
- ✅ URL configurada corretamente
- ✅ Notificações sendo entregues
- ✅ Histórico de notificações

---

## ❌ Se Ainda Não Funcionar

### Verificar:

1. **A função está deployada?**
   ```powershell
   firebase functions:list
   ```

2. **A URL está acessível?**
   - Abra no navegador: `https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago`
   - Deve retornar um erro de método (isso é normal, significa que está funcionando)

3. **Há erros nos logs?**
   ```powershell
   firebase functions:log --only webhookMercadoPago
   ```

4. **O Mercado Pago está enviando?**
   - Verifique no painel do Mercado Pago se há tentativas de envio
   - Veja se há erros nas notificações

---

## ✅ URLs Corretas (Para Copiar)

### Webhook Mercado Pago:
```
https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
```

### Create User:
```
https://us-central1-plegi-d84c2.cloudfunctions.net/createUserAndSendEmail
```

---

**Depois de corrigir tudo, teste novamente!** 🚀











































