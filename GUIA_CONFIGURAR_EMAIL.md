# 📧 Guia de Configuração de Email

## Para enviar emails automaticamente após pagamento confirmado

### Opção 1: Gmail (Mais Fácil)

1. **Ativar Aplicativo Menos Seguro (Não recomendado) ou Usar App Password:**
   - Acesse: https://myaccount.google.com/security
   - Ative "Verificação em duas etapas"
   - Vá em "Senhas de app"
   - Crie uma senha de app para "Email"

2. **Configurar no Firebase Functions:**

```bash
# No terminal, dentro da pasta functions
firebase functions:config:set email.user="seu-email@gmail.com"
firebase functions:config:set email.password="senha-de-app-aqui"
```

3. **Fazer deploy:**

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

---

### Opção 2: SendGrid (Recomendado - Mais Profissional)

1. **Criar conta no SendGrid:**
   - Acesse: https://sendgrid.com/
   - Crie uma conta gratuita (100 emails/dia grátis)

2. **Obter API Key:**
   - Settings > API Keys
   - Create API Key
   - Permissão: "Full Access" ou apenas "Mail Send"

3. **Configurar no Firebase:**

```bash
firebase functions:config:set sendgrid.api_key="sua_api_key_aqui"
```

4. **Atualizar código da função:**

Altere o `createEmailTransporter()` em `functions/index.js`:

```javascript
const sgMail = require('@sendgrid/mail')

const createEmailTransporter = () => {
  const apiKey = functions.config().sendgrid?.api_key || process.env.SENDGRID_API_KEY
  if (!apiKey) {
    console.error('SendGrid API Key não configurada!')
    return null
  }
  sgMail.setApiKey(apiKey)
  return sgMail
}
```

E instale o pacote:

```bash
cd functions
npm install @sendgrid/mail
```

---

### Opção 3: Resend (Moderno e Simples)

1. **Criar conta:** https://resend.com/
2. **Obter API Key**
3. **Configurar:**

```bash
firebase functions:config:set resend.api_key="sua_api_key_aqui"
```

---

## 📝 Variáveis de Ambiente Locais

Para desenvolvimento local, crie `functions/.env`:

```env
EMAIL_USER=seu-email@gmail.com
EMAIL_PASSWORD=senha-de-app
# ou
SENDGRID_API_KEY=sua_api_key
```

---

## ✅ Testar Envio de Email

Após configurar, teste a função:

```bash
curl -X POST https://us-central1-seu-projeto.cloudfunctions.net/createUserAndSendEmail \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@example.com",
    "name": "Teste",
    "password": "senha123",
    "transactionId": "TXN-123"
  }'
```

---

## 🔒 Segurança

- ✅ Nunca exponha credenciais no código
- ✅ Use Firebase Config ou variáveis de ambiente
- ✅ Para produção, use serviços profissionais (SendGrid, Resend)
- ✅ Configure SPF e DKIM no seu domínio (se usar domínio próprio)
























