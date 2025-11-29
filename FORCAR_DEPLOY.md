# 🚀 Como Forçar Deploy no Vercel

## Opção 1: Via Interface Web (Mais Fácil) ⭐

1. Acesse [vercel.com](https://vercel.com) e faça login
2. Vá no seu projeto: `flashconcards`
3. Clique na aba **"Deployments"**
4. Encontre o último deployment
5. Clique nos **3 pontinhos (...)** no canto superior direito
6. Selecione **"Redeploy"**
7. Confirme o redeploy

✅ **Pronto!** O deploy será forçado imediatamente.

---

## Opção 2: Via CLI (Requer Login)

### Passo 1: Fazer Login

```bash
npx vercel login
```

Isso abrirá o navegador para você autorizar.

### Passo 2: Forçar Deploy

```bash
npx vercel --prod --yes
```

---

## Opção 3: Push Vazio (Força Deploy Automático)

Se o projeto já está conectado ao Git, qualquer push força um novo deploy:

```bash
git commit --allow-empty -m "Force deploy"
git push
```

---

## ⚡ Deploy Automático

O Vercel já está configurado para fazer deploy automático a cada push no GitHub!

Sempre que você fizer:
```bash
git add .
git commit -m "Sua mensagem"
git push
```

O Vercel detecta automaticamente e faz o deploy! 🎉

---

**Recomendação:** Use a **Opção 1** (Interface Web) - é mais rápida e não requer configuração!









