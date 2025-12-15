# 🚀 Guia de Integração - Mercado Pago

## 📋 Passo a Passo para Configurar Pagamentos

### 1️⃣ Criar Conta no Mercado Pago

1. Acesse: https://www.mercadopago.com.br/
2. Clique em "Criar conta"
3. Preencha seus dados (CPF, email, senha)
4. Complete a verificação de identidade

---

### 2️⃣ Obter Credenciais de API

1. Acesse: https://www.mercadopago.com.br/developers/panel
2. Vá em "Suas integrações"
3. Clique em "Criar aplicação"
4. Preencha:
   - **Nome**: FlashconCards Payment
   - **Categoria**: Marketplace
5. Copie as credenciais:
   - **Public Key** (chave pública) - começa com `APP_USR_`
   - **Access Token** (chave privada) - começa com `APP_USR_`

⚠️ **IMPORTANTE**: Você terá credenciais diferentes para:
- **Test** (Sandbox) - para testar sem cobrança real
- **Production** (Produção) - para cobranças reais

---

### 3️⃣ Adicionar Credenciais ao Projeto

Adicione ao arquivo `.env` na raiz do projeto:

```env
# Mercado Pago - Sandbox (Teste)
VITE_MERCADOPAGO_PUBLIC_KEY_TEST=sua_public_key_test_aqui
VITE_MERCADOPAGO_ACCESS_TOKEN_TEST=seu_access_token_test_aqui

# Mercado Pago - Produção
VITE_MERCADOPAGO_PUBLIC_KEY_PROD=sua_public_key_prod_aqui
VITE_MERCADOPAGO_ACCESS_TOKEN_PROD=seu_access_token_prod_aqui

# Ambiente (test ou prod)
VITE_MERCADOPAGO_ENV=test
```

---

### 4️⃣ Instalar SDK do Mercado Pago

```bash
npm install mercadopago
```

Ou se preferir usar o SDK no frontend:

```bash
npm install @mercadopago/sdk-react
```

---

### 5️⃣ Configurar Webhook (Importante!)

O webhook recebe as confirmações de pagamento do Mercado Pago.

1. Acesse: https://www.mercadopago.com.br/developers/panel/app/{seu_app_id}/webhooks
2. Clique em "Adicionar URL"
3. URL do webhook: `https://seu-dominio.com/api/webhook/mercadopago`
4. Eventos para receber:
   - `payment` (quando pagamento é aprovado)
   - `payment.updated` (quando status do pagamento muda)

⚠️ **Para desenvolvimento local**, use: https://ngrok.com/ ou similar para criar um túnel

---

### 6️⃣ Criar Função Cloud para Webhook (Firebase Functions)

Crie o arquivo `functions/src/webhookMercadoPago.js`:

```javascript
const functions = require('firebase-functions')
const admin = require('firebase-admin')
const { MercadoPagoConfig, Payment } = require('mercadopago')

admin.initializeApp()

exports.webhookMercadoPago = functions.https.onRequest(async (req, res) => {
  try {
    const { type, data } = req.body
    
    if (type === 'payment') {
      const paymentId = data.id
      
      // Buscar pagamento no Mercado Pago
      const client = new MercadoPagoConfig({
        accessToken: functions.config().mercadopago.access_token_prod,
        options: { timeout: 5000 }
      })
      const payment = new Payment(client)
      const paymentData = await payment.get({ id: paymentId })
      
      // Atualizar transação no Firestore
      const transactionRef = admin.firestore()
        .collection('transactions')
        .where('mercadopagoPaymentId', '==', paymentId)
        .limit(1)
      
      const snapshot = await transactionRef.get()
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0]
        const transactionData = doc.data()
        
        // Atualizar status
        await doc.ref.update({
          status: paymentData.status === 'approved' ? 'paid' : 'pending',
          mercadopagoStatus: paymentData.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
        
        // Se pagamento aprovado, ativar acesso do usuário
        if (paymentData.status === 'approved') {
          const userRef = admin.firestore().collection('users').doc(transactionData.userId)
          await userRef.update({
            hasActiveSubscription: true,
            subscriptionStartDate: admin.firestore.FieldValue.serverTimestamp(),
            lastPaymentDate: admin.firestore.FieldValue.serverTimestamp()
          })
        }
      }
    }
    
    res.status(200).send('OK')
  } catch (error) {
    console.error('Erro no webhook:', error)
    res.status(500).send('Error')
  }
})
```

---

### 7️⃣ Implementar Checkout no Frontend

O arquivo `src/routes/Payment.jsx` já está preparado. Você precisa:

1. **Importar o SDK do Mercado Pago**
2. **Inicializar com sua Public Key**
3. **Criar preferência de pagamento**
4. **Processar pagamento com cartão ou PIX**

Exemplo de integração (adicionar ao `Payment.jsx`):

```javascript
import { initMercadoPago, Wallet } from '@mercadopago/sdk-react'

// Inicializar Mercado Pago
initMercadoPago(import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY_TEST)

// Para processar cartão
const handleCardPayment = async () => {
  // Criar preferência no backend
  const response = await fetch('/api/create-preference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: product.price,
      installments,
      cardData
    })
  })
  
  const { preferenceId } = await response.json()
  
  // Abrir checkout do Mercado Pago
  // O Mercado Pago retornará para seu webhook
}
```

---

### 8️⃣ Testar em Modo Sandbox

1. Use as credenciais de **TEST**
2. Use cartões de teste do Mercado Pago:
   - **Aprovado**: 5031 7557 3453 0604
   - **Recusado**: 5031 4332 1540 6351
   - CVV: 123
   - Vencimento: 11/25
   - Nome: APRO

3. Para PIX, o pagamento aparecerá como pendente no sandbox

---

### 9️⃣ Configurar para Produção

1. Substitua as credenciais de TEST pelas de PROD
2. Mude `VITE_MERCADOPAGO_ENV=prod`
3. Configure o webhook com a URL de produção
4. Teste uma compra real com valor baixo primeiro

---

## 📊 Estrutura de Dados no Firestore

A coleção `transactions` armazena:

```javascript
{
  userId: "user_uid",
  userEmail: "user@email.com",
  productName: "Mentoria ALEGO",
  amount: 99.90,
  paymentMethod: "pix" | "card",
  installments: 1,
  status: "pending" | "paid" | "cancelled",
  mercadopagoPaymentId: "123456789",
  mercadopagoPreferenceId: "pref_123456",
  createdAt: Timestamp,
  paidAt: Timestamp
}
```

---

## 🔒 Segurança

- ✅ Nunca exponha seu **Access Token** no frontend
- ✅ Use apenas **Public Key** no frontend
- ✅ Processe pagamentos no backend
- ✅ Valide assinatura do webhook
- ✅ Use HTTPS sempre

---

## 📞 Suporte

- Documentação: https://www.mercadopago.com.br/developers/pt/docs
- Suporte: https://www.mercadopago.com.br/developers/pt/support

---

## 🎯 Próximos Passos

Após configurar:

1. ✅ Testar checkout completo em sandbox
2. ✅ Configurar webhook funcionando
3. ✅ Testar ativação automática de acesso
4. ✅ Fazer primeiro pagamento real (valor baixo)
5. ✅ Monitorar transações no painel do Mercado Pago











































