# 🚀 Guia de Deploy no Vercel

## ✅ Pré-requisitos

- [x] Projeto configurado e funcionando localmente
- [x] Conta no [Vercel](https://vercel.com) (gratuita)
- [x] Repositório no GitLab (ou GitHub)

## 📋 Opção 1: Deploy via Interface Web (Recomendado)

### Passo 1: Conectar Repositório

1. Acesse [vercel.com](https://vercel.com) e faça login
2. Clique em **"Add New Project"**
3. Conecte sua conta do **GitLab** (ou GitHub)
4. Selecione o repositório: `preparatorioflashconcards`

### Passo 2: Configurar o Projeto

A Vercel detectará automaticamente que é um projeto Vite. Configure:

- **Framework Preset:** Vite
- **Root Directory:** `./` (raiz)
- **Build Command:** `npm run build` (já vem preenchido)
- **Output Directory:** `dist` (já vem preenchido)
- **Install Command:** `npm install` (já vem preenchido)

### Passo 3: Adicionar Variáveis de Ambiente

⚠️ **MUITO IMPORTANTE:** Adicione todas as variáveis de ambiente antes de fazer deploy!

Na seção **"Environment Variables"**, adicione:

```
VITE_FIREBASE_API_KEY=sua_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu_projeto_id
VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
VITE_FIREBASE_APP_ID=seu_app_id
VITE_GEMINI_API_KEY=sua_gemini_api_key_aqui
```

💡 **Dica:** Veja o arquivo `VARIAVEIS_VERCEL.md` para uma lista completa e instruções detalhadas!

### Passo 4: Deploy

1. Clique em **"Deploy"**
2. Aguarde o build (2-3 minutos)
3. Pronto! Seu site estará no ar! 🎉

### Passo 5: Configurar Domínio (Opcional)

1. Vá em **Settings > Domains**
2. Adicione seu domínio personalizado (ex: `mentoria-alego.com`)
3. Configure o DNS conforme instruções

## 📋 Opção 2: Deploy via CLI

### Passo 1: Instalar Vercel CLI

```bash
npm install -g vercel
```

### Passo 2: Fazer Login

```bash
vercel login
```

### Passo 3: Deploy

```bash
# Deploy de produção
vercel --prod

# Ou deploy de preview (teste)
vercel
```

### Passo 4: Configurar Variáveis de Ambiente

```bash
# Adicionar variáveis uma por uma
vercel env add VITE_FIREBASE_API_KEY
vercel env add VITE_FIREBASE_AUTH_DOMAIN
vercel env add VITE_FIREBASE_PROJECT_ID
vercel env add VITE_FIREBASE_STORAGE_BUCKET
vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID
vercel env add VITE_FIREBASE_APP_ID
vercel env add VITE_GEMINI_API_KEY
```

Ou adicione via interface web (mais fácil).

## 🔄 Deploy Automático

Após o primeiro deploy, a Vercel fará **deploy automático** sempre que você fizer push no GitLab:

```bash
git add .
git commit -m "Atualização"
git push origin main
```

A Vercel detectará automaticamente e fará o deploy! 🚀

## ⚙️ Configurações Importantes

### Arquivo `vercel.json`

O arquivo `vercel.json` já está criado e configurado com:
- ✅ Build command correto
- ✅ Output directory correto
- ✅ Rewrites para SPA (Single Page Application)

### Variáveis de Ambiente

**IMPORTANTE:** As variáveis de ambiente devem ser configuradas na Vercel, não no código!

1. Vá em **Settings > Environment Variables**
2. Adicione cada variável
3. Selecione os ambientes: Production, Preview, Development
4. Salve

## 🐛 Troubleshooting

### Erro: "Build Failed"

1. Verifique se todas as variáveis de ambiente estão configuradas
2. Verifique os logs de build na Vercel
3. Teste o build localmente: `npm run build`

### Erro: "404 Not Found" nas rotas

O arquivo `vercel.json` já está configurado com rewrites. Se ainda der erro:
1. Verifique se o arquivo `vercel.json` está na raiz
2. Verifique se o `outputDirectory` está correto (`dist`)

### Erro: "Firebase not configured"

1. Verifique se todas as variáveis `VITE_FIREBASE_*` estão configuradas
2. Verifique se os valores estão corretos (sem espaços extras)

## 📊 Monitoramento

Após o deploy, você terá acesso a:
- ✅ Logs de build
- ✅ Analytics (opcional)
- ✅ Deploy previews (para cada PR)
- ✅ Domínio personalizado

## 🎯 Próximos Passos

1. ✅ Fazer primeiro deploy
2. ✅ Testar todas as funcionalidades
3. ✅ Configurar domínio personalizado (opcional)
4. ✅ Configurar CI/CD (já automático)

## 🚀 URL do Deploy

Após o deploy, você receberá uma URL como:
- `https://preparatorioflashconcards.vercel.app`
- Ou seu domínio personalizado

---

**Pronto para deploy!** 🎉

