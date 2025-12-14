# 🚨 3 PROBLEMAS ENCONTRADOS - SOLUÇÕES RÁPIDAS

## ❌ PROBLEMA 1: URL do Webhook Errada

**O que vi na imagem:**
```
URL configurada: https:// https://us-central1-plegi-d84
```

**Problema:** Tem duplo `https://` e está truncada!

**✅ SOLUÇÃO (2 minutos):**

1. Acesse: https://www.mercadopago.com.br/developers/panel/app/3743437950896305/webhooks
2. Clique em **"Configurar notificações"**
3. **Remova** a URL antiga
4. **Cole esta URL** (copie exatamente, sem espaços):
   ```
   https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
   ```
5. Selecione: `payment` e `payment.updated`
6. **Salve**

---

## ❌ PROBLEMA 2: Domínio Não Autorizado no Firebase

**Erro no console:**
```
The current domain is not authorized for OAuth operations.
Add your domain (www.hostinger.autos) to the OAuth redirect domains
```

**✅ SOLUÇÃO (1 minuto):**

1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/authentication/settings
2. Role até **"Authorized domains"** (Domínios autorizados)
3. Clique em **"Add domain"**
4. Adicione: `www.hostinger.autos`
5. Clique em **"Add domain"** novamente
6. Adicione: `hostinger.autos` (sem www)
7. **Pronto!**

---

## ❌ PROBLEMA 3: Erro de Permissão no Firestore

**Erro no console:**
```
Missing or insufficient permissions
```

**Isso pode ser porque:**
- Usuário não está autenticado
- Ou está tentando ler algo sem permissão

**✅ SOLUÇÃO:**

As regras do Firestore já estão corretas. O problema é que você precisa estar **logado** para ler transações.

**Se o erro continuar:**
1. Faça login no site
2. Ou verifique se está autenticado no código

---

## 🧪 TESTAR SE FUNCIONOU

### Teste 1: Verificar URL do Webhook

**No PowerShell:**
```powershell
Invoke-WebRequest -Uri "https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago" -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"type":"test"}'
```

**Deve retornar:** `{"received":true,"message":"Evento não processado"}`

### Teste 2: Ver Logs

```powershell
firebase functions:log --only webhookMercadoPago
```

### Teste 3: Verificar no Mercado Pago

No painel de webhooks, deve aparecer:
- ✅ URL configurada corretamente
- ✅ Status: Ativo

---

## 📋 CHECKLIST RÁPIDO

- [ ] URL do webhook corrigida (sem duplo https://)
- [ ] Domínio `www.hostinger.autos` adicionado ao Firebase
- [ ] Domínio `hostinger.autos` adicionado ao Firebase
- [ ] Teste da função executado
- [ ] Logs verificados

---

## 🎯 ORDEM DE CORREÇÃO

1. **Primeiro:** Corrigir URL do webhook (mais importante!)
2. **Segundo:** Adicionar domínios ao Firebase
3. **Terceiro:** Testar

**Tempo total:** ~5 minutos

---

## ✅ DEPOIS DE CORRIGIR

1. Faça um pagamento de teste
2. Verifique se o webhook recebe a notificação
3. Verifique se a transação é atualizada no Firestore
4. Verifique se o email é enviado

---

**Corrija esses 3 problemas e tudo vai funcionar!** 🚀
































