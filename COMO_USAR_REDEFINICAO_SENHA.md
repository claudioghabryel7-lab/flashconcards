# 🔐 Como Usar a Redefinição de Senha Oculta

## 📍 Rota Oculta

A rota de redefinição de senha está em:
```
/reset/:token
```

Onde `:token` é um token aleatório gerado pelo admin.

## 🔑 Como Gerar um Link

1. **Acesse o Painel Admin** (`/admin`)
2. **Role até a seção "Gerar Link de Redefinição de Senha"**
3. **Digite o email do usuário** que precisa redefinir a senha
4. **Clique em "Gerar Link"**
5. **Copie o link gerado** (botão "Copiar")

## 📋 Exemplo de Link Gerado

```
https://seu-dominio.vercel.app/reset/550e8400-e29b-41d4-a716-446655440000-abc123xyz-xyz789abc
```

O token é único, aleatório e seguro.

## ⚠️ Características do Link

- ✅ **Expira em 24 horas**
- ✅ **Só pode ser usado UMA vez**
- ✅ **Token aleatório e seguro** (impossível adivinhar)
- ✅ **Rota oculta** (não aparece no menu)

## 🎯 Como o Usuário Usa o Link

1. Usuário recebe o link (você envia por email/WhatsApp)
2. Usuário clica no link
3. Sistema verifica se o token é válido
4. Se válido, envia email do Firebase Auth para redefinir senha
5. Usuário recebe email do Firebase com link oficial de redefinição
6. Usuário clica no link do email e redefine a senha

## 🔒 Segurança

- Token gerado com `crypto.randomUUID()` + timestamp + random
- Validação de expiração (24h)
- Validação de uso único
- Apenas admin pode gerar links
- Regras do Firestore protegem os tokens

## 📝 Nota Importante

O link gerado **não redefine a senha diretamente**. Ele:
1. Valida o token
2. Envia um email oficial do Firebase Auth
3. O usuário usa o link do email do Firebase para redefinir

Isso garante máxima segurança usando o sistema oficial do Firebase.

