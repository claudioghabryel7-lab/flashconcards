# 🔥 Como Fazer Deploy das Regras do Firestore

## ⚠️ Problema com Firebase Tools

O `firebase-tools` está com erro no seu sistema. Use uma das opções:

---

## 📋 Opção 1: Firebase Console (Mais Fácil)

### 1. Acesse:
https://console.firebase.google.com/project/plegi-d84c2/firestore/rules

### 2. Cole as regras atualizadas:
Abra o arquivo `firestore.rules` e copie todo o conteúdo.

### 3. Cole no Firebase Console:
- Clique em "Editar regras"
- Cole o conteúdo completo
- Clique em "Publicar"

---

## 📋 Opção 2: Corrigir Firebase Tools

### 1. Reinstalar firebase-tools:
```bash
npm uninstall -g firebase-tools
npm install -g firebase-tools@latest
```

### 2. Depois fazer deploy:
```bash
firebase deploy --only firestore:rules
```

---

## ✅ O Que Foi Corrigido

Adicionei regras para a coleção `transactions`:
- ✅ Qualquer pessoa pode **criar** transações (checkout público)
- ✅ Usuários autenticados podem **ler** suas próprias transações
- ✅ Apenas admin pode **atualizar** ou **deletar** transações

---

## 🎯 Sobre Mercado Pago

**Sim, você precisa configurar uma conta no Mercado Pago**, mas:

1. **Por enquanto**: O sistema está funcionando em **modo simulação**
   - PIX: Cria transação com status "pending"
   - Cartão: Simula pagamento (aceita/rejeita aleatoriamente)

2. **Para produção**: Você precisa:
   - Criar conta no Mercado Pago: https://www.mercadopago.com.br
   - Obter credenciais (Access Token)
   - Integrar o SDK do Mercado Pago
   - Configurar webhooks para confirmação de pagamento

3. **Documentação completa**: Veja `GUIA_INTEGRACAO_MERCADO_PAGO.md`

---

## 🚀 Próximos Passos

1. **Agora**: Faça deploy das regras via Firebase Console
2. **Teste**: Tente fazer um pagamento novamente
3. **Depois**: Configure Mercado Pago para pagamentos reais

---

**As regras já estão corrigidas no código! Só falta fazer o deploy! 🎉**











































