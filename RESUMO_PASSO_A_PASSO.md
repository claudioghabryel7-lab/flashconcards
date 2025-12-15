# ✅ Resumo: Passo a Passo para Deploy e Configuração

## 🎯 O que você precisa fazer (em ordem):

### 1️⃣ **Fazer Deploy das Funções Firebase**

**Opção Rápida (Script):**
```powershell
cd "C:\Users\Ghabryel Concurseiro\flashconcards"
.\deploy-functions.ps1
```

**Ou Manualmente:**
```powershell
cd "C:\Users\Ghabryel Concurseiro\flashconcards"
firebase login
firebase use plegi-d84c2
cd functions
npm install
cd ..
firebase deploy --only functions
```

**📝 O que fazer:**
- Anote as URLs que aparecem na tela após o deploy
- Você verá algo como:
  ```
  Function URL: https://us-central1-plegi-d84c2.cloudfunctions.net/createUserAndSendEmail
  Function URL: https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
  ```

---

### 2️⃣ **Atualizar URLs no Código (Se Necessário)**

**Se as URLs forem diferentes** das que estão no código:

1. Abra o arquivo: `src/config/firebaseFunctions.js`
2. Atualize as URLs com as que você anotou
3. Salve o arquivo

**✅ O código já está preparado!** As URLs estão centralizadas em um arquivo de configuração.

---

### 3️⃣ **Configurar Webhook no Mercado Pago**

1. **Acesse:** https://www.mercadopago.com.br/developers/panel
2. **Faça login** com sua conta
3. **Selecione sua aplicação**
4. **Vá em "Webhooks"** ou **"Notificações"**
5. **Clique em "Adicionar URL"**
6. **Cole a URL do webhook:**
   ```
   https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
   ```
7. **Selecione os eventos:**
   - ✅ `payment`
   - ✅ `payment.updated`
8. **Clique em "Salvar"**

---

### 4️⃣ **Verificar se Está Tudo Funcionando**

**Ver logs das funções:**
```powershell
firebase functions:log
```

**Acessar console do Firebase:**
https://console.firebase.google.com/project/plegi-d84c2/functions

---

## 📋 Checklist Rápido

- [ ] Deploy das funções feito
- [ ] URLs anotadas
- [ ] URLs atualizadas no código (se necessário)
- [ ] Webhook configurado no Mercado Pago
- [ ] Teste realizado
- [ ] Logs verificados

---

## 🆘 Precisa de Ajuda?

**Documentos criados para você:**

1. **`GUIA_COMPLETO_DEPLOY_E_CONFIGURACAO.md`** - Guia detalhado completo
2. **`GUIA_DEPLOY_FUNCOES_FIREBASE_PASSO_A_PASSO.md`** - Guia técnico detalhado
3. **`deploy-functions.ps1`** - Script automatizado para deploy

**Comandos úteis:**

```powershell
# Ver status do Firebase
firebase projects:list

# Ver funções deployadas
firebase functions:list

# Ver logs
firebase functions:log

# Fazer deploy novamente
firebase deploy --only functions
```

---

## ✅ Status Atual do Código

- ✅ Funções Firebase criadas (`functions/index.js`)
- ✅ Código do frontend atualizado (`src/routes/Payment.jsx`)
- ✅ Configuração centralizada (`src/config/firebaseFunctions.js`)
- ✅ Script de deploy criado (`deploy-functions.ps1`)
- ⚠️ **Falta:** Fazer o deploy e configurar webhook

---

**Agora é só seguir os passos acima! 🚀**









































