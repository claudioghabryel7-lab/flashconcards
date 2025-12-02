# 🚀 Configurar IA para Gerar Questões - Guia Rápido

## ❓ Por que preciso disso?
Para gerar questões automaticamente com IA, você precisa de uma API key de IA.

## 🎯 Opções Disponíveis

### Opção 1: Groq (RECOMENDADO - Mais fácil e rápido) ⭐
- ✅ **Gratuito** e sem limite diário
- ✅ **Mais rápido** (respostas instantâneas)
- ✅ **Muito fácil** de configurar
- ✅ Link direto: https://console.groq.com/keys

### Opção 2: Google Gemini
- ✅ Gratuito mas com limite de 200 requisições/dia
- ✅ Boa qualidade
- Link: https://aistudio.google.com/app/apikey

---

## 📝 COMO CONFIGURAR GROQ (RECOMENDADO)

### Passo 1: Obter a API Key
1. Acesse: **https://console.groq.com/keys**
2. Faça login com sua conta Google
3. Clique em **"Create API Key"**
4. Dê um nome (ex: "PLEGIMENTORIA")
5. Clique em **"Submit"**
6. **COPIE A CHAVE** - ela só aparece uma vez!

### Passo 2: Adicionar no .env
Envie a chave para mim que eu adiciono automaticamente, ou adicione você mesmo:

Abra o arquivo `.env` e adicione esta linha:
```
VITE_GROQ_API_KEY=sua-chave-aqui
```

Substitua `sua-chave-aqui` pela chave que você copiou.

### Passo 3: Reiniciar o servidor
```bash
# Pare o servidor (Ctrl+C)
npm run dev
```

---

## 📝 COMO CONFIGURAR GEMINI

### Passo 1: Obter a API Key
1. Acesse: **https://aistudio.google.com/app/apikey**
2. Faça login com sua conta Google
3. Clique em **"Create API Key"**
4. Escolha um projeto ou crie um novo
5. **COPIE A CHAVE**

### Passo 2: Adicionar no .env
Adicione esta linha no arquivo `.env`:
```
VITE_GEMINI_API_KEY=sua-chave-aqui
```

---

## 💡 Recomendação
**Use Groq** - é mais fácil, rápido e não tem limite diário!

---

**Depois de configurar qualquer uma das duas, reinicie o servidor e as questões vão funcionar!** 🎉






