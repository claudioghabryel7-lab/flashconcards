# 🔥 Guia Completo: Como Obter as Variáveis do Firebase

## 📋 Passo a Passo Detalhado

### 1️⃣ Acesse o Firebase Console

1. Abra seu navegador e acesse: **https://console.firebase.google.com**
2. Faça login com sua conta Google (a mesma que você usa para o Firebase)

### 2️⃣ Selecione ou Crie seu Projeto

- Se já tiver um projeto Firebase:
  - Clique no nome do projeto na lista
  - Pule para o **Passo 3**
  
- Se NÃO tiver um projeto ainda:
  - Clique no botão **"Adicionar projeto"** ou **"Create a project"**
  - Dê um nome ao projeto (ex: "plegimentoria" ou "flashconcards")
  - Clique em **"Continuar"**
  - Se perguntar sobre Google Analytics, você pode desabilitar (não é necessário)
  - Clique em **"Criar projeto"**
  - Aguarde alguns segundos até o projeto ser criado
  - Clique em **"Continuar"**

### 3️⃣ Obtenha as Configurações do Firebase

Agora você precisa acessar as configurações do projeto:

1. Clique no **ícone de engrenagem (⚙️)** no canto superior esquerdo
2. Clique em **"Configurações do projeto"** ou **"Project settings"**

### 4️⃣ Encontre a Seção "Seus apps"

1. Role a página até encontrar a seção **"Seus apps"** ou **"Your apps"**
2. Se você **JÁ TEM um app web** listado:
   - Clique no ícone de **configurações (⚙️)** ao lado do app
   - OU clique no nome do app
   - Pule para o **Passo 5**

3. Se você **NÃO TEM** um app web ainda:
   - Clique no ícone **"</>"** (Web) para adicionar um app web
   - Dê um nome ao app (ex: "Web App" ou "Plegimentoria Web")
   - Você pode deixar o checkbox "Também configurar o Firebase Hosting" desmarcado
   - Clique em **"Registrar app"**
   - Você verá uma tela com um objeto `firebaseConfig` - essa é a informação que você precisa!

### 5️⃣ Copie as Variáveis

Na tela de configurações do app, você verá algo assim:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto-id",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdefghijklmnop"
};
```

**O que cada variável significa e onde encontrar:**

| Variável que eu preciso | Onde está no Firebase | Exemplo |
|------------------------|----------------------|---------|
| `apiKey` | `firebaseConfig.apiKey` | `AIzaSy...` |
| `authDomain` | `firebaseConfig.authDomain` | `projeto.firebaseapp.com` |
| `projectId` | `firebaseConfig.projectId` | `meu-projeto-123` |
| `storageBucket` | `firebaseConfig.storageBucket` | `projeto.appspot.com` |
| `messagingSenderId` | `firebaseConfig.messagingSenderId` | `123456789012` |
| `appId` | `firebaseConfig.appId` | `1:123456:web:abc123` |

### 6️⃣ Copie e Envie para Mim

Copie **APENAS OS VALORES** (sem as aspas) de cada variável e me envie assim:

```
apiKey: AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
authDomain: meu-projeto.firebaseapp.com
projectId: meu-projeto-123
storageBucket: meu-projeto.appspot.com
messagingSenderId: 123456789012
appId: 1:123456789012:web:abcdefghijklmnop
```

## ⚠️ IMPORTANTE

- ✅ **É seguro** me enviar essas variáveis - elas são públicas (já que vão no código do navegador)
- ✅ Elas não dão acesso total ao seu projeto, apenas permitem usar os serviços
- ✅ Você pode sempre regenerá-las se necessário

## 🔍 Não conseguiu encontrar?

Se você não conseguir encontrar essas informações:

1. Verifique se está na página correta: **Configurações do projeto** → **Seus apps**
2. Se não houver app web, você precisa criar um (Passo 4)
3. As variáveis estão na seção "Configuração do SDK" ou "SDK setup and configuration"

## 📸 Dica Visual

As variáveis geralmente aparecem em uma caixa de código na página, parecida com:

```
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/...";
  
  const firebaseConfig = {
    apiKey: "...",
    authDomain: "...",
    // ... resto das configurações
  };
</script>
```

---

**Depois que você me enviar essas 6 variáveis, eu configuro tudo automaticamente para você!** 🚀

































