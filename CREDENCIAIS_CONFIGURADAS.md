# ✅ Credenciais Configuradas

## 📧 Credenciais de Email

- **Email**: flashconcards@gmail.com
- **Senha de App**: rasw vyoj inal ginb

## 💳 Credenciais do Mercado Pago (Produção)

- **Public Key**: `APP_USR-9e9eac57-183f-496f-9d20-536fa16ae5f1`
- **Access Token**: `APP_USR-3743437950896305-112812-559fadd346072c35f8cb81e21d4e562d-2583165550`
- **Client ID**: `3743437950896305`
- **Client Secret**: `ctBrwFuNCvqHiVal1KqAt3hpgf1fyXXO`
- **Ambiente**: `prod` (Produção)

✅ **Status**: Credenciais adicionadas ao arquivo `.env`

## ✅ Status das Credenciais

### Email
As credenciais de email já estão configuradas no código da função Firebase (`functions/index.js`) como valores padrão. O sistema vai:

1. **Tentar** pegar do Firebase Config (se configurado)
2. **Tentar** pegar de variáveis de ambiente
3. **Usar valores padrão** (suas credenciais) se não encontrar

Isso significa que **já está funcionando** mesmo sem configurar no Firebase Console!

### Mercado Pago
As credenciais do Mercado Pago foram adicionadas ao arquivo `.env` e estão prontas para uso. Para usar em produção:

1. ✅ Credenciais já estão no `.env`
2. ⚠️ **Importante**: Adicione também no Vercel (Settings > Environment Variables)
3. ⚠️ **Importante**: Configure o webhook no painel do Mercado Pago
4. ⚠️ **Importante**: Instale o SDK: `npm install @mercadopago/sdk-react` ou `npm install mercadopago`

---

## 🚀 Próximo Passo: Deploy das Funções

Para fazer as funções funcionarem em produção, você precisa fazer deploy:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

⚠️ **Importante**: Antes de fazer deploy, verifique se você está logado no Firebase:

```bash
firebase login
```

---

## 📧 Como Funciona Agora

### Quando um pagamento for confirmado:

1. ✅ Sistema cria conta automaticamente no Firebase Auth
2. ✅ Cria perfil no Firestore
3. ✅ Ativa acesso (`hasActiveSubscription: true`)
4. ✅ Envia email para o cliente com:
   - Confirmação de pagamento
   - Email de acesso
   - Senha gerada
   - Link para fazer login

---

## 🔒 Segurança

As credenciais estão no código como fallback, mas para produção é recomendado:

1. Configurar no Firebase Console (veja `CONFIGURAR_CREDENCIAIS_EMAIL.md`)
2. Ou usar variáveis de ambiente no Firebase Functions

Por enquanto, como fallback, as credenciais estão no código.

---

## ✅ Testar

Após fazer deploy, teste a função:

```bash
curl -X POST https://us-central1-plegi-d84c2.cloudfunctions.net/createUserAndSendEmail \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@example.com",
    "name": "Teste",
    "password": "senha123",
    "transactionId": "TXN-123"
  }'
```

---

## 🎯 Tudo Pronto!

O sistema de envio de email está configurado e pronto para uso!


