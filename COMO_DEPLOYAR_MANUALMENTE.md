# 🚀 Como Fazer Deploy Manual das Funções Firebase

## ⚠️ IMPORTANTE: Firebase Console não permite deploy direto

O Firebase Console **não permite fazer deploy de código diretamente**. Você precisa usar a **Firebase CLI** (linha de comando).

---

## 📋 OPÇÃO 1: Deploy de TODAS as Funções (Mais Confiável)

Se o deploy de uma função específica está travando, tente fazer deploy de todas:

```powershell
# 1. Certifique-se de estar na raiz do projeto
cd "C:\Users\Ghabryel Concurseiro\flashconcards"

# 2. Verifique se está logado
firebase login:list

# 3. Selecione o projeto
firebase use plegi-d84c2

# 4. Instale dependências (se necessário)
cd functions
npm install
cd ..

# 5. Faça deploy de TODAS as funções
firebase deploy --only functions
```

**Vantagem:** Mais estável, não trava tanto quanto deploy individual.

---

## 📋 OPÇÃO 2: Usar o Script PowerShell

```powershell
cd "C:\Users\Ghabryel Concurseiro\flashconcards"
.\deploy-functions.ps1
```

O script faz tudo automaticamente:
- Verifica login
- Instala dependências
- Faz deploy

---

## 📋 OPÇÃO 3: Deploy com Timeout Aumentado

Se o deploy está travando, pode ser timeout. Tente:

```powershell
# Aumentar timeout do Node
$env:NODE_OPTIONS="--max-old-space-size=4096"
firebase deploy --only functions
```

---

## 📋 OPÇÃO 4: Deploy via Google Cloud Console (Alternativa Avançada)

Se a CLI continuar travando, você pode usar o Google Cloud Console:

### Passo a Passo:

1. **Acesse o Google Cloud Console:**
   - https://console.cloud.google.com/functions?project=plegi-d84c2

2. **Clique na função `sendMassEmail`**

3. **Vá em "EDITAR" (Edit)**

4. **Na aba "Código Fonte" (Source Code):**
   - Você pode editar o código diretamente
   - **MAS:** Isso é complicado para funções grandes

5. **Melhor opção:** Use o Cloud Shell:
   - No topo do Google Cloud Console, clique no ícone **">_"** (Cloud Shell)
   - Isso abre um terminal no navegador
   - Execute os comandos normalmente lá

---

## 📋 OPÇÃO 5: Usar Cloud Shell (Terminal no Navegador)

1. **Acesse:** https://console.cloud.google.com/home/dashboard?project=plegi-d84c2

2. **Clique no ícone do Cloud Shell** (">_" no topo)

3. **No Cloud Shell, execute:**
   ```bash
   # Clonar seu repositório (se necessário)
   git clone https://github.com/claudioghabryel7-lab/flashconcards.git
   cd flashconcards
   
   # Fazer deploy
   firebase deploy --only functions:sendMassEmail
   ```

**Vantagem:** Roda na nuvem do Google, geralmente mais estável.

---

## 📋 O que fazer no Firebase Console (Após Deploy)

O Firebase Console serve para:

### ✅ Verificar Funções Deployadas:
- https://console.firebase.google.com/project/plegi-d84c2/functions
- Veja todas as funções
- Veja logs em tempo real
- Veja estatísticas de uso

### ✅ Ver Logs:
- Clique na função `sendMassEmail`
- Vá em "Logs"
- Veja erros e execuções

### ✅ Testar Função:
- Clique na função
- Vá em "Testing"
- Teste a função diretamente

### ✅ Configurar Variáveis de Ambiente:
- Clique na função
- Vá em "Configuration"
- Adicione variáveis de ambiente se necessário

---

## 🎯 RECOMENDAÇÃO FINAL

**Tente nesta ordem:**

1. ✅ **Deploy de todas as funções:** `firebase deploy --only functions`
2. ✅ **Usar o script:** `.\deploy-functions.ps1`
3. ✅ **Cloud Shell:** Terminal no navegador do Google Cloud
4. ✅ **Verificar no Console:** Após deploy, verifique se funcionou

---

## ❓ Se Nada Funcionar

1. **Verifique sua conexão de internet**
2. **Tente em outro horário** (pode ser problema temporário do Firebase)
3. **Verifique se tem créditos/quota** no projeto Firebase
4. **Entre em contato com suporte Firebase** se persistir

---

## ✅ Após o Deploy Bem-Sucedido

Você verá uma mensagem como:

```
✔  functions[sendMassEmail(us-central1)]: Successful update operation.
Function URL (sendMassEmail): https://us-central1-plegi-d84c2.cloudfunctions.net/sendMassEmail
```

**Anote essa URL!** Ela já está configurada no seu código, mas é bom verificar.

