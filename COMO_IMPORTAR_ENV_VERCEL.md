# 📥 Como Importar Variáveis no Vercel

O Vercel permite importar variáveis de ambiente diretamente de um arquivo `.env`!

## 🚀 Método Rápido: Importar .env

### Passo 1: Preparar o arquivo .env

1. Abra seu arquivo `.env` local (na raiz do projeto)
2. **Copie todo o conteúdo** do arquivo
3. Ou use o arquivo `.env.template` como base e preencha com seus valores

### Passo 2: Importar no Vercel

1. Acesse seu projeto no Vercel
2. Vá em **Settings** > **Environment Variables**
3. Clique no botão **"Import .env"** (ou "Import .env file")
4. **Cole o conteúdo** do seu arquivo `.env` na área de texto
5. Clique em **"Save"**

✅ **Pronto!** Todas as variáveis serão importadas automaticamente!

## ⚠️ Importante

- **NÃO** commite o arquivo `.env` no Git (já está no `.gitignore`)
- O arquivo `.env.template` é apenas um template - preencha com seus valores reais
- Após importar, verifique se todas as variáveis foram adicionadas corretamente
- Configure para todos os ambientes: **Production**, **Preview**, **Development**

## 🔄 Alternativa: Adicionar Manualmente

Se preferir adicionar uma por uma:
1. Vá em **Settings** > **Environment Variables**
2. Clique em **"Add New"**
3. Adicione cada variável individualmente
4. Veja a lista completa em `VARIAVEIS_VERCEL.md`

## 📋 Formato do .env

Seu arquivo `.env` deve ter este formato:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto-id
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_GEMINI_API_KEY=AIzaSy...
```

**Sem espaços** ao redor do `=` e **sem aspas** (a menos que o valor contenha espaços).

---

**Depois de importar, faça um novo deploy!** 🚀


