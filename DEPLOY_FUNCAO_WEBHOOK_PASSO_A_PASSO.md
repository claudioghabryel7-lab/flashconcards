# 🚀 Deploy da Função Firebase - Passo a Passo

## ⚠️ Problema Detectado

O `firebase-tools` está com dependências corrompidas. Vamos corrigir isso primeiro!

---

## 📋 Passo 1: Reinstalar Firebase Tools

### Opção A: Reinstalar Globalmente (Recomendado)

```powershell
# Desinstalar versão atual
npm uninstall -g firebase-tools

# Instalar versão mais recente
npm install -g firebase-tools@latest
```

### Opção B: Usar npx (Alternativa)

Se a reinstalação não funcionar, você pode usar `npx` sem instalar globalmente:

```powershell
npx firebase-tools --version
```

---

## 📋 Passo 2: Verificar Login no Firebase

```powershell
firebase login
```

Ou se já estiver logado:

```powershell
firebase login:list
```

Se não estiver logado, o comando abrirá o navegador para autenticação.

---

## 📋 Passo 3: Verificar Projeto Firebase

```powershell
firebase use --add
```

Selecione o projeto: **plegi-d84c2**

Ou definir diretamente:

```powershell
firebase use plegi-d84c2
```

---

## 📋 Passo 4: Instalar Dependências da Função

```powershell
cd functions
npm install
cd ..
```

Isso instalará todas as dependências necessárias (`firebase-functions`, `firebase-admin`, `cors`, `nodemailer`, etc.)

---

## 📋 Passo 5: Verificar Estrutura

Certifique-se de que o arquivo `functions/index.js` existe e contém a função `webhookMercadoPago`.

---

## 📋 Passo 6: Fazer Deploy da Função

### Opção A: Deploy apenas da função webhook (Recomendado)

```powershell
firebase deploy --only functions:webhookMercadoPago
```

### Opção B: Deploy de todas as funções

```powershell
firebase deploy --only functions
```

---

## 📋 Passo 7: Verificar Deploy

Após o deploy, você verá uma mensagem como:

```
✔  functions[webhookMercadoPago(us-central1)]: Successful create operation.
Function URL (webhookMercadoPago): https://us-central1-plegi-d84c2.cloudfunctions.net/webhookMercadoPago
```

**Copie essa URL!** Você precisará dela para configurar no Mercado Pago.

---

## 🐛 Troubleshooting

### Erro: "Cannot find module 'lodash/defaults'"

**Solução:**
```powershell
npm uninstall -g firebase-tools
npm install -g firebase-tools@latest
```

### Erro: "Permission denied"

**Solução:**
Execute o PowerShell como Administrador:
1. Clique com botão direito no PowerShell
2. Selecione "Executar como administrador"
3. Execute os comandos novamente

### Erro: "Project not found"

**Solução:**
```powershell
firebase use --add
# Selecione o projeto plegi-d84c2
```

### Erro: "Functions directory not found"

**Solução:**
Certifique-se de estar na raiz do projeto (onde está o arquivo `firebase.json`)

---

## ✅ Checklist

Antes de fazer deploy, verifique:

- [ ] Firebase Tools instalado e funcionando
- [ ] Logado no Firebase (`firebase login`)
- [ ] Projeto correto selecionado (`firebase use plegi-d84c2`)
- [ ] Dependências instaladas (`cd functions && npm install`)
- [ ] Arquivo `functions/index.js` existe e tem a função `webhookMercadoPago`
- [ ] Arquivo `firebase.json` existe na raiz

---

## 🎯 Próximos Passos

Após o deploy bem-sucedido:

1. ✅ Copie a URL da função
2. ✅ Configure no painel do Mercado Pago (veja `COMO_CONFIGURAR_WEBHOOK_MERCADO_PAGO.md`)
3. ✅ Teste o webhook

---

## 📝 Comandos Rápidos (Copy & Paste)

```powershell
# 1. Reinstalar Firebase Tools
npm uninstall -g firebase-tools
npm install -g firebase-tools@latest

# 2. Login (se necessário)
firebase login

# 3. Selecionar projeto
firebase use plegi-d84c2

# 4. Instalar dependências
cd functions
npm install
cd ..

# 5. Deploy
firebase deploy --only functions:webhookMercadoPago
```

---

**Pronto! Siga esses passos e sua função estará no ar!** 🚀































