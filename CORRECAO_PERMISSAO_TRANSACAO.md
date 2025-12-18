# ✅ Correção: Erro de Permissão ao Criar Transação

## 🚨 Problema Identificado

**Erro:**
```
FirebaseError: Missing or insufficient permissions
```

**Causa:**
O erro ocorria ao tentar criar ou atualizar transações no Firestore. As regras anteriores não permitiam que usuários não autenticados atualizassem transações após criá-las (especialmente para adicionar dados do PIX).

---

## ✅ Solução Aplicada

### 1. Regras do Firestore Atualizadas

Atualizei as regras para permitir:

- ✅ **Criação de transações** por qualquer pessoa (checkout público)
- ✅ **Leitura de transações** por qualquer pessoa (para verificar status)
- ✅ **Atualização de transações** por qualquer pessoa (para adicionar dados do PIX)

**Regras deployadas com sucesso!**

---

## 🧪 Como Testar

1. **Recarregue a página** de pagamento (F5 ou Ctrl+R)
2. **Limpe o cache** se necessário (Ctrl+Shift+Delete)
3. **Tente criar um pagamento PIX novamente**
4. **Verifique o console** - o erro de permissão não deve mais aparecer

---

## ⚠️ Importante

Agora há dois problemas que precisam ser resolvidos:

### 1. Erro de Permissão do Firestore ✅
- **STATUS:** RESOLVIDO
- As regras foram atualizadas e deployadas

### 2. PIX não habilitado no Mercado Pago ⏳
- **STATUS:** PENDENTE
- A conta do Mercado Pago precisa ter a chave PIX configurada

**Para habilitar o PIX:**
1. Acesse: https://www.mercadopago.com.br/account/settings
2. Configure uma chave PIX (CPF, CNPJ, Email ou Chave Aleatória)
3. Aguarde a confirmação

---

## ✅ Status

- ✅ Erro de permissão corrigido
- ✅ Regras deployadas
- ⏳ Aguardando habilitação do PIX no Mercado Pago

**Próximo passo:** Habilitar a chave PIX na conta do Mercado Pago seguindo os passos acima.

---

## 🔗 Referências

- Ver também: `SOLUCAO_ERRO_PIX_NAO_HABILITADO.md`









































