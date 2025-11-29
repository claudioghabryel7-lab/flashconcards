# 🚀 Guia para Subir o Projeto para o GitLab

## ✅ Checklist Antes de Subir

- [x] `.gitignore` configurado (ignora `.env`, `node_modules`, `dist`)
- [x] `README.md` atualizado com documentação completa
- [x] Nenhum arquivo sensível será commitado (`.env` está no `.gitignore`)

## 📝 Passo a Passo

### 1. Inicializar o Repositório Git (se ainda não foi feito)

```bash
git init
```

### 2. Adicionar Todos os Arquivos

```bash
git add .
```

### 3. Fazer o Primeiro Commit

```bash
git commit -m "Initial commit: Sistema de mentoria ALEGO com flashcards, SRS e mentor IA"
```

### 4. Adicionar o Remote do GitLab

```bash
git remote add origin https://gitlab.com/claudioghabryel7/preparatorioflashconcards.git
```

### 5. Renomear Branch para Main

```bash
git branch -M main
```

### 6. Fazer Push para o GitLab

```bash
git push -uf origin main
```

## ⚠️ IMPORTANTE: Variáveis de Ambiente

**NUNCA** commite o arquivo `.env` com suas credenciais reais!

O arquivo `.env` já está no `.gitignore`, mas verifique antes de fazer commit:

```bash
# Verificar se .env não está sendo rastreado
git status | grep .env
```

Se aparecer algo, remova do staging:

```bash
git reset HEAD .env
```

## 🔐 Configurar Variáveis no GitLab CI/CD (Opcional)

Se você for usar CI/CD no GitLab, configure as variáveis de ambiente no painel:

1. Vá em **Settings > CI/CD > Variables**
2. Adicione cada variável:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_GEMINI_API_KEY`

## 📦 Arquivos que SERÃO Commitados

✅ Código fonte (`src/`)
✅ Configurações (`package.json`, `vite.config.js`, `tailwind.config.js`)
✅ Documentação (`README.md`, `*.md`)
✅ Regras do Firestore (`firestore.rules`)
✅ Arquivos públicos (`public/`)

## 🚫 Arquivos que NÃO SERÃO Commitados

❌ `.env` (credenciais)
❌ `node_modules/` (dependências)
❌ `dist/` (build de produção)
❌ Arquivos de log
❌ Arquivos do editor (`.vscode/`, `.idea/`)

## 🔄 Comandos para Atualizações Futuras

```bash
# Verificar status
git status

# Adicionar mudanças
git add .

# Fazer commit
git commit -m "Descrição das mudanças"

# Fazer push
git push origin main
```

## 🎯 Pronto!

Após executar os comandos acima, seu projeto estará no GitLab e pronto para:
- Colaboração em equipe
- CI/CD automático
- Deploy automatizado
- Versionamento de código









