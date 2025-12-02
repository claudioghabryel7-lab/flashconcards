# 🔧 Como Adicionar Domínio ao Firebase Auth - Guia Detalhado

## 🎯 O Que Você Precisa Fazer

Adicionar `www.hostinger.autos` e `hostinger.autos` aos domínios autorizados do Firebase Authentication.

---

## 📋 MÉTODO 1: Pela Interface do Firebase (Recomendado)

### Passo a Passo Detalhado:

1. **Acesse o Console do Firebase:**
   ```
   https://console.firebase.google.com/project/plegi-d84c2/authentication/settings
   ```
   Ou:
   - Acesse: https://console.firebase.google.com
   - Selecione o projeto: **plegi-d84c2**
   - No menu lateral, clique em **"Authentication"** (Autenticação)
   - Clique na aba **"Settings"** (Configurações) no topo

2. **Encontre a Seção "Authorized domains" (Domínios autorizados)**
   - Role a página para baixo
   - Procure por uma seção chamada **"Authorized domains"** ou **"Domínios autorizados"**
   - Você verá uma lista de domínios já autorizados (geralmente inclui `localhost` e alguns domínios do Firebase)

3. **Adicione o Primeiro Domínio:**
   - Clique no botão **"Add domain"** ou **"Adicionar domínio"**
   - Uma caixa de diálogo ou campo de texto aparecerá
   - Digite exatamente: `www.hostinger.autos`
   - **NÃO** inclua `http://` ou `https://` - apenas o domínio!
   - Clique em **"Add"** ou **"Adicionar"**

4. **Adicione o Segundo Domínio:**
   - Clique em **"Add domain"** novamente
   - Digite: `hostinger.autos` (sem o www)
   - Clique em **"Add"**

5. **Verifique:**
   - Os dois domínios devem aparecer na lista
   - Não precisa salvar - o Firebase salva automaticamente

---

## 🔍 ONDE ESTÁ O BOTÃO "ADD DOMAIN"?

Se você não está vendo o botão, pode estar em lugares diferentes dependendo da versão do Firebase:

### Opção A: Na Seção "Authorized domains"
- Role até a seção "Authorized domains"
- Deve ter um botão azul ou link "Add domain"

### Opção B: No Topo da Página
- Pode haver um botão "Add domain" no topo da página de Settings

### Opção C: Ao Lado da Lista
- Pode estar ao lado direito da lista de domínios

---

## ❌ SE NÃO CONSEGUIR ADICIONAR

### Problema 1: Não Vejo o Botão "Add domain"

**Soluções:**
1. **Verifique se você tem permissões de administrador:**
   - Você precisa ser owner ou ter permissões de edição no projeto
   - Se não tiver, peça para o owner adicionar

2. **Tente em outro navegador:**
   - Chrome, Firefox, Edge
   - Limpe o cache (Ctrl+Shift+Delete)

3. **Tente modo anônimo/privado:**
   - Abra uma janela anônima
   - Faça login novamente

### Problema 2: O Domínio Não É Aceito

**Possíveis causas:**
- Domínio inválido (tem http:// ou https://)
- Domínio já existe na lista
- Formato incorreto

**Solução:**
- Use apenas: `www.hostinger.autos` (sem http:// ou https://)
- Verifique se já não está na lista

### Problema 3: Erro ao Salvar

**Soluções:**
1. Aguarde alguns segundos e tente novamente
2. Recarregue a página (F5)
3. Tente adicionar um domínio por vez

---

## 🔄 MÉTODO 2: Via Firebase CLI (Alternativa)

Se não conseguir pela interface, tente pelo terminal:

```powershell
# Verificar se está logado
firebase login

# Listar projetos
firebase projects:list

# Selecionar projeto
firebase use plegi-d84c2

# Infelizmente, o Firebase CLI não tem comando direto para adicionar domínios
# Mas você pode verificar a configuração atual
```

**Nota:** O Firebase CLI não tem comando para adicionar domínios autorizados. Isso só pode ser feito pela interface web.

---

## 🔄 MÉTODO 3: Verificar se Já Está Adicionado

Pode ser que o domínio já esteja lá e você não viu:

1. Acesse: https://console.firebase.google.com/project/plegi-d84c2/authentication/settings
2. Role até "Authorized domains"
3. Procure na lista por:
   - `www.hostinger.autos`
   - `hostinger.autos`

Se já estiver lá, **não precisa fazer nada!** ✅

---

## 🧪 TESTAR SE ESTÁ FUNCIONANDO

Depois de adicionar (ou verificar que já está), teste:

1. Acesse seu site: https://www.hostinger.autos
2. Tente fazer login
3. Se funcionar sem o erro de domínio não autorizado, está OK! ✅

---

## 📸 ONDE FICA EXATAMENTE?

### Caminho Completo:

1. **Console Firebase:** https://console.firebase.google.com
2. **Selecione projeto:** plegi-d84c2
3. **Menu lateral:** Authentication (ícone de chave)
4. **Aba superior:** Settings (Configurações)
5. **Seção:** Authorized domains (role para baixo)
6. **Botão:** Add domain

### URL Direta:

```
https://console.firebase.google.com/project/plegi-d84c2/authentication/settings
```

---

## ⚠️ IMPORTANTE

- **NÃO** adicione `http://` ou `https://`
- **NÃO** adicione barra `/` no final
- Adicione **apenas** o domínio: `www.hostinger.autos`
- E também: `hostinger.autos` (sem www)

---

## 🆘 AINDA NÃO CONSEGUIU?

Se mesmo assim não conseguir:

1. **Tire um print da tela** e me mostre onde você está
2. **Me diga qual erro aparece** (se houver)
3. **Verifique se você é owner do projeto:**
   - Vá em: https://console.firebase.google.com/project/plegi-d84c2/settings/general
   - Veja se seu email aparece como "Owner"

---

## ✅ CHECKLIST

- [ ] Acessei a página de Settings do Authentication
- [ ] Encontrei a seção "Authorized domains"
- [ ] Vi o botão "Add domain"
- [ ] Adicionei `www.hostinger.autos`
- [ ] Adicionei `hostinger.autos`
- [ ] Os dois aparecem na lista
- [ ] Testei o site e não aparece mais o erro

---

**Me diga em qual passo você está travando que eu ajudo mais!** 🚀









