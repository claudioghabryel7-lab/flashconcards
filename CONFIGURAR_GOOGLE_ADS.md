# 📊 CONFIGURAÇÃO GOOGLE ADS - Rastreamento de Conversões

## ✅ O QUE FOI IMPLEMENTADO:

1. ✅ Google Ads já está configurado no `index.html` (ID: `AW-17766035851`)
2. ✅ Rastreamento de cliques nos botões "Garantir Promoção"
3. ✅ Função para rastrear conversões quando necessário

---

## 🔧 CONFIGURAR CONVERSION LABEL:

Para rastrear conversões reais, você precisa:

### 1. Criar Ação de Conversão no Google Ads

1. Acesse: https://ads.google.com/
2. Vá em **"Ferramentas e configurações"** → **"Conversões"**
3. Clique em **"+"** para criar nova conversão
4. Selecione **"Site"**
5. Configure:
   - **Nome:** Compra Mentoria ALEGO
   - **Categoria:** Compra/Venda
   - **Valor:** R$ 99,90
   - **Contagem:** Uma
6. Copie o **"Rótulo de conversão"** (algo como: `ABC123XYZ`)

### 2. Adicionar no Código

Abra `src/utils/googleAds.js` e substitua:

```javascript
'send_to': conversionLabel || 'AW-17766035851/SEU_CONVERSION_LABEL',
```

Por (substitua `SEU_CONVERSION_LABEL` pelo rótulo que você copiou):

```javascript
'send_to': conversionLabel || 'AW-17766035851/ABC123XYZ',
```

---

## 🎯 COMO FUNCIONA:

### Rastreamento de Cliques:

Quando alguém clica em "Garantir Promoção":
- ✅ Google Ads registra o clique
- ✅ Você pode ver no Google Ads quantos cliques teve

### Rastreamento de Conversões:

**Opção 1: Via Webhook da Hotmart (Recomendado)**

Quando alguém compra na Hotmart, o webhook pode disparar a conversão:

1. Configure o webhook da Hotmart para chamar uma função
2. A função dispara a conversão no Google Ads
3. Google Ads registra a conversão automaticamente

**Opção 2: Via Página de Obrigado**

1. Configure uma página de "Obrigado" na Hotmart
2. Redirecione para: `https://seusite.com/obrigado?purchase=true`
3. O código detecta e dispara a conversão automaticamente

**Opção 3: Manual (Você marca como convertido)**

Quando você criar o usuário manualmente, pode disparar a conversão.

---

## 📝 ADICIONAR PÁGINA DE OBRIGADO:

Se quiser, posso criar uma página `/obrigado` que:
- Detecta quando usuário volta da Hotmart
- Dispara conversão automaticamente
- Mostra mensagem de agradecimento

---

## 🧪 TESTAR:

1. Abra o site
2. Abra o Console do navegador (F12)
3. Clique em "Garantir Promoção"
4. Deve aparecer: `✅ Clique rastreado no Google Ads`

---

## ✅ PRONTO!

O Google Ads já está rastreando:
- ✅ Cliques nos botões
- ✅ Pronto para rastrear conversões (após configurar o rótulo)

---

## 🆘 PRÓXIMOS PASSOS:

1. **Criar ação de conversão no Google Ads**
2. **Copiar o rótulo de conversão**
3. **Adicionar no código** (`src/utils/googleAds.js`)
4. **Configurar webhook ou página de obrigado** (opcional)

**Me avise se quer que eu crie a página de obrigado ou configure o webhook para disparar conversões!** 🚀


