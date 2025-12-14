# 🔧 Corrigir URL do Webhook no Mercado Pago

## ❌ Problema Encontrado

A URL está com **erro de digitação**:
```
https:// https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
```

Tem **duplo `https://`** no início!

---

## ✅ URL CORRETA

A URL que você deve usar é da **função Firebase**, não do seu site:

```
https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
```

**⚠️ IMPORTANTE:**
- **NÃO** é a URL do seu site (hostinger.autos)
- **É** a URL da função Firebase que criamos especificamente para receber webhooks
- Esta função está rodando no Google Cloud, não no seu site

---

## 🔧 Como Corrigir

### Passo a Passo:

1. **No painel do Mercado Pago**, encontre o campo "URL para teste"
2. **Remova** a URL antiga (a que tem duplo https://)
3. **Cole esta URL** (copie exatamente, sem espaços):
   ```
   https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
   ```
4. **Verifique os eventos selecionados:**
   - ✅ **Pagamentos** (Payments) - DEVE estar marcado
   - ✅ **Card Updater** - pode estar marcado (opcional)
5. **Clique em "Salvar"** ou "Guardar"

---

## 🧪 Por Que Esta URL?

### O Que É Esta URL?

Esta é a URL da **função Firebase Cloud Function** que deployamos. Ela:
- Recebe notificações do Mercado Pago quando há pagamentos
- Processa os pagamentos automaticamente
- Atualiza o status no Firestore
- Ativa o acesso do usuário quando o pagamento é aprovado

### Por Que Não É a URL do Site?

- O webhook precisa de um **endpoint estável e sempre disponível**
- A função Firebase roda no Google Cloud, não depende do seu site
- Funciona mesmo se o site estiver em manutenção
- É mais seguro e confiável

---

## ✅ Depois de Corrigir

1. **Aguarde alguns segundos** - o Mercado Pago testa a URL automaticamente
2. **Verifique se aparece "URL válida"** ou similar
3. **Teste um pagamento** - o webhook deve receber a notificação

---

## 🔍 Verificar se Está Funcionando

### No Mercado Pago:
- Deve aparecer "URL configurada" ou "Webhook ativo"
- Deve mostrar histórico de notificações enviadas

### Nos Logs do Firebase:
```powershell
firebase functions:log --only webhookMercadoPago
```

---

## 📋 Checklist

- [ ] URL corrigida (sem duplo https://)
- [ ] Evento "Pagamentos" marcado
- [ ] URL salva no Mercado Pago
- [ ] Teste de pagamento realizado
- [ ] Logs verificados

---

**Corrija a URL e teste novamente!** 🚀
































