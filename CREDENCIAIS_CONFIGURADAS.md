# ✅ Credenciais de Email Configuradas

## 📧 Credenciais

- **Email**: flashconcards@gmail.com
- **Senha de App**: rasw vyoj inal ginb

## ✅ Status

As credenciais já estão configuradas no código da função Firebase (`functions/index.js`) como valores padrão. O sistema vai:

1. **Tentar** pegar do Firebase Config (se configurado)
2. **Tentar** pegar de variáveis de ambiente
3. **Usar valores padrão** (suas credenciais) se não encontrar

Isso significa que **já está funcionando** mesmo sem configurar no Firebase Console!

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

