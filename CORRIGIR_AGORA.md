# 🚨 CORRIGIR AGORA - 3 Passos Rápidos

## ⚡ Problemas Encontrados e Como Corrigir

---

## 1️⃣ CORRIGIR URL DO WEBHOOK (2 minutos)

**Problema:** URL está com erro: `https:// https://us-central1-plegi-d84`

**Solução:**

1. Acesse: https://www.mercadopago.com.br/developers/panel/app/3743437950896305/webhooks
2. Clique em **"Configurar notificações"**
3. **Remova** a URL antiga
4. **Cole esta URL** (copie exatamente):
   ```
   https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
   ```
5. Selecione eventos: `payment` e `payment.updated`
6. **Salve**

---

## 2️⃣ ADICIONAR DOMÍNIO AO FIREBASE (1 minuto)

**Problema:** `www.hostinger.autos` não está autorizado

**Solução:**

1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/authentication/settings
2. Role até **"Authorized domains"**
3. Clique em **"Add domain"**
4. Adicione: `www.hostinger.autos`
5. Adicione também: `hostinger.autos`
6. **Salve**

---

## 3️⃣ TESTAR SE FUNCIONOU (1 minuto)

**No PowerShell:**
```powershell
firebase functions:log --only webhookMercadoPago
```

**Ou teste a URL:**
```powershell
Invoke-WebRequest -Uri "https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago" -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"type":"test"}'
```

---

## ✅ Pronto!

Depois desses 3 passos, tudo deve funcionar! 🎉

















