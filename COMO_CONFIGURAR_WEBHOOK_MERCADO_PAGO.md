# 🔗 Como Configurar Webhook do Mercado Pago

## 📋 Passo a Passo Completo

### 1️⃣ Obter a URL do Webhook

A URL do seu webhook é a função Firebase que acabamos de criar:

```
https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
```

⚠️ **Importante**: Esta URL só estará disponível após fazer o deploy da função Firebase!

---

### 2️⃣ Fazer Deploy da Função Firebase

Antes de configurar no Mercado Pago, você precisa fazer deploy da função:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions:webhookMercadoPago
```

Ou fazer deploy de todas as funções:

```bash
firebase deploy --only functions
```

---

### 3️⃣ Configurar no Painel do Mercado Pago

#### Passo 1: Acessar o Painel de Desenvolvedores

1. Acesse: https://www.mercadopago.com.br/developers/panel
2. Faça login com sua conta do Mercado Pago
3. Selecione sua aplicação (ou crie uma nova se ainda não tiver)

#### Passo 2: Encontrar a Seção de Webhooks

1. No menu lateral, clique em **"Webhooks"** ou **"Notificações"**
2. Ou acesse diretamente: https://www.mercadopago.com.br/developers/panel/app/{SEU_APP_ID}/webhooks
   - Substitua `{SEU_APP_ID}` pelo ID da sua aplicação

#### Passo 3: Adicionar Nova URL de Webhook

1. Clique no botão **"Adicionar URL"** ou **"Criar Webhook"**
2. Cole a URL do webhook:
   ```
   https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
   ```
3. Selecione os eventos que deseja receber:
   - ✅ **payment** (quando um pagamento é criado)
   - ✅ **payment.updated** (quando o status de um pagamento muda)
   - ✅ **merchant_order** (opcional - para pedidos)

#### Passo 4: Salvar

1. Clique em **"Salvar"** ou **"Criar"**
2. O Mercado Pago testará a URL automaticamente
3. Se aparecer um erro, verifique se a função Firebase está deployada

---

### 4️⃣ Testar o Webhook

#### Opção 1: Teste Manual (Recomendado)

1. No painel do Mercado Pago, após criar o webhook, clique em **"Testar"** ou **"Enviar notificação de teste"**
2. Verifique os logs do Firebase Functions para ver se recebeu

#### Opção 2: Teste com Pagamento Real (Sandbox)

1. Faça um pagamento de teste usando as credenciais de sandbox
2. O webhook será chamado automaticamente quando o pagamento for processado
3. Verifique no Firestore se a transação foi atualizada

---

### 5️⃣ Verificar Logs

Para verificar se o webhook está funcionando:

1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/functions/logs
2. Procure por logs da função `webhookMercadoPago`
3. Você verá mensagens como:
   - `Webhook recebido: { type: 'payment', data: {...} }`
   - `Transação atualizada para status: paid`

---

## 🔍 Como Funciona

### Fluxo Completo:

1. **Cliente faz pagamento** → Mercado Pago processa
2. **Mercado Pago envia webhook** → Sua função Firebase recebe
3. **Função atualiza transação** → Status muda para "paid" no Firestore
4. **Acesso é ativado** → Usuário recebe acesso à plataforma
5. **Email é enviado** → Cliente recebe credenciais (se aplicável)

---

## ⚠️ Importante

### Segurança

- ✅ O webhook sempre retorna status 200 (mesmo em caso de erro)
- ✅ Isso evita que o Mercado Pago tente reenviar múltiplas vezes
- ✅ Erros são logados no Firebase para debug

### Validação

Por enquanto, o webhook aceita qualquer requisição. Para produção, recomenda-se:

1. Validar a assinatura do webhook (verificar header `x-signature`)
2. Verificar se o IP de origem é do Mercado Pago
3. Validar o formato dos dados recebidos

---

## 🐛 Troubleshooting

### Webhook não está sendo chamado

1. ✅ Verifique se a função está deployada: `firebase functions:list`
2. ✅ Verifique se a URL está correta no painel do Mercado Pago
3. ✅ Teste a URL manualmente: `curl https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago`

### Erro 404 ao testar

- A função ainda não foi deployada
- Execute: `firebase deploy --only functions:webhookMercadoPago`

### Webhook recebido mas transação não atualiza

1. Verifique os logs do Firebase Functions
2. Verifique se o `mercadopagoPaymentId` está sendo salvo na transação
3. Verifique se o formato do paymentId está correto (string vs número)

---

## 📝 Checklist

- [ ] Função Firebase criada e deployada
- [ ] URL do webhook copiada
- [ ] Webhook configurado no painel do Mercado Pago
- [ ] Eventos selecionados (payment, payment.updated)
- [ ] Teste realizado e funcionando
- [ ] Logs verificados

---

## 🎯 Próximos Passos

Após configurar o webhook:

1. ✅ Testar com um pagamento real (sandbox)
2. ✅ Verificar se a transação é atualizada automaticamente
3. ✅ Verificar se o acesso do usuário é ativado
4. ✅ Monitorar logs para garantir que está funcionando

---

**Pronto! Seu webhook está configurado!** 🚀










