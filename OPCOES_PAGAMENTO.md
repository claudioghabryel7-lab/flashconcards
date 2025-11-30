# 💳 Opções de Gateway de Pagamento

## 📋 Resumo das Melhores Opções para o Brasil

### 🥇 **1. Mercado Pago (RECOMENDADO)**
**Por que escolher:**
- ✅ Mais popular no Brasil
- ✅ Suporta PIX, cartão de crédito/débito
- ✅ Parcelamento em até 12x
- ✅ Crédito cai em 2-3 dias úteis (PIX instantâneo)
- ✅ Fácil integração
- ✅ Taxas competitivas: ~4.99% por transação + R$ 0.40

**Taxas:**
- PIX: 1.99% (cai na hora)
- Débito: 2.99% + R$ 0.40
- Crédito à vista: 4.99% + R$ 0.40
- Crédito parcelado: 4.99% + R$ 0.40 + juros do parcelamento

**Como configurar:**
1. Acesse: https://www.mercadopago.com.br/developers/pt/docs
2. Crie uma conta ou faça login
3. Vá em "Suas integrações" > "Criar aplicação"
4. Copie o **Access Token** (chave pública e privada)
5. Configure no arquivo `.env`

---

### 🥈 **2. Asaas**
**Por que escolher:**
- ✅ Especializado em PIX e boleto
- ✅ Taxas mais baixas para PIX
- ✅ API simples e documentação clara
- ✅ Ideal para recorrência

**Taxas:**
- PIX: 1.99% (cai em até 1 hora)
- Cartão de crédito: 3.99% + R$ 0.40
- Parcelamento: 3.99% + R$ 0.40 + juros

**Como configurar:**
1. Acesse: https://www.asaas.com/
2. Crie uma conta
3. Vá em "Configurações" > "API"
4. Gere sua chave de API
5. Configure no arquivo `.env`

---

### 🥉 **3. Iugu**
**Por que escolher:**
- ✅ Gateway brasileiro robusto
- ✅ Suporta múltiplos métodos
- ✅ Boa para empresas

**Taxas:**
- PIX: 2.99%
- Cartão: 4.99% + R$ 0.40

**Como configurar:**
1. Acesse: https://www.iugu.com/
2. Crie uma conta
3. Vá em "API" > "Token"
4. Gere seu token de API
5. Configure no arquivo `.env`

---

## 🚀 Implementação Atual: Mercado Pago

Vou implementar o **Mercado Pago** como solução inicial por ser a mais completa e popular no Brasil.

### Estrutura do Sistema de Pagamento

1. **Página de Checkout** (`/pagamento`)
   - Seleção de método de pagamento (PIX, Cartão)
   - Formulário de dados do cartão
   - Seleção de parcelas (até 10x)
   - Confirmação e processamento

2. **Webhook para Confirmação**
   - Recebe confirmação do Mercado Pago
   - Atualiza status do pagamento no Firestore
   - Ativa acesso do usuário automaticamente

3. **Integração com Firebase**
   - Salva transações no Firestore
   - Vincula pagamento ao usuário
   - Histórico de pagamentos no admin

---

## 📝 Próximos Passos

Após escolher o gateway:

1. **Criar conta no gateway escolhido**
2. **Obter credenciais de API** (Access Token, Public Key, etc.)
3. **Adicionar no `.env`** as variáveis necessárias
4. **Configurar webhook** para receber confirmações
5. **Testar em modo sandbox** antes de ir para produção

---

## 🔒 Segurança

- ✅ Cartões são processados diretamente pelo gateway (não passam pelo nosso servidor)
- ✅ Apenas tokenização de cartão no frontend
- ✅ Webhooks assinados para validação
- ✅ Dados sensíveis nunca são armazenados

