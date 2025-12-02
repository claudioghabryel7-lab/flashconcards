# 📧 Configurar Credenciais de Email - Guia Rápido

## ✅ Credenciais Fornecidas

- **Email**: flashconcards@gmail.com
- **Senha de App**: rasw vyoj inal ginb

## 🔧 Como Configurar

### Opção 1: Firebase Console (Recomendado)

1. Acesse: https://console.firebase.google.com/
2. Selecione seu projeto: **plegi-d84c2**
3. Vá em **Functions** > **Configurações**
4. Adicione variáveis de ambiente:
   - `EMAIL_USER` = `flashconcards@gmail.com`
   - `EMAIL_PASSWORD` = `rasw vyoj inal ginb`

### Opção 2: Via Terminal (Se funcionar)

```bash
cd functions
firebase functions:config:set email.user="flashconcards@gmail.com"
firebase functions:config:set email.password="rasw vyoj inal ginb"
firebase deploy --only functions
```

### Opção 3: Valores Padrão no Código

O código já está configurado com suas credenciais como fallback. Se a configuração do Firebase não funcionar, o sistema usará esses valores automaticamente.

---

## ✅ Status Atual

As credenciais já estão configuradas no código como valores padrão. O sistema vai:
1. Tentar pegar do Firebase Config
2. Se não encontrar, usar valores padrão (suas credenciais)
3. Enviar email automaticamente após pagamento confirmado

---

## 🚀 Próximo Passo: Fazer Deploy

Depois de configurar (ou usar os valores padrão), faça deploy:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Ou se preferir, configure via Firebase Console e depois faça deploy.

---

## 📧 Testar Envio de Email

Após deploy, teste a função:

```bash
curl -X POST https://us-central1-plegi-d84c2.cloudfunctions.net/createUserAndSendEmail \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@example.com",
    "name": "Teste Usuário",
    "password": "senha123456",
    "transactionId": "TXN-TEST-123"
  }'
```

---

## ✅ Pronto!

Suas credenciais estão configuradas. O sistema enviará emails automaticamente após cada pagamento confirmado.










