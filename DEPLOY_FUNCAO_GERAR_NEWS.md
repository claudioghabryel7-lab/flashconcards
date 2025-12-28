# 🚀 Deploy da Função generateNewsFromLink

## ⚠️ Erro Atual

O erro de CORS está acontecendo porque a função `generateNewsFromLink` ainda não foi deployada no Firebase.

## ✅ Solução: Fazer Deploy

Execute o seguinte comando no terminal:

```bash
firebase deploy --only functions:generateNewsFromLink
```

Ou para fazer deploy de todas as funções:

```bash
firebase deploy --only functions
```

## 📋 Passo a Passo

1. **Abra o terminal** na raiz do projeto
2. **Execute o comando:**
   ```bash
   firebase deploy --only functions:generateNewsFromLink
   ```
3. **Aguarde o deploy** (pode levar 2-5 minutos)
4. **Copie a URL** que aparecer no terminal (algo como: `https://us-central1-plegi-d84c2.cloudfunctions.net/generateNewsFromLink`)
5. **Verifique** se a URL está correta no arquivo `src/config/firebaseFunctions.js`

## ✅ Após o Deploy

A função estará disponível e o erro de CORS será resolvido automaticamente, pois o CORS já está configurado para aceitar requisições de `http://localhost:5173`.

## 🔍 Verificar se Funcionou

Após o deploy, teste novamente:
1. Acesse `/blank`
2. Faça login como admin
3. Clique em "Painel Admin"
4. Cole um link de referência
5. Clique em "Gerar Notícia por IA"

Se ainda der erro, verifique os logs:
```bash
firebase functions:log --only generateNewsFromLink
```


