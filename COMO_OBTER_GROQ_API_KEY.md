# Como Obter e Configurar a Groq API Key

## 🎯 O que é Groq?

Groq é uma API de IA **sem limite diário** que funciona como fallback automático quando o Gemini atinge o limite de 200 requisições/dia.

## ✅ Vantagens do Groq

- ✅ **Sem limite diário** (apenas rate limiting por minuto)
- ✅ **Muito rápido** (respostas em milissegundos)
- ✅ **Gratuito** com limites generosos
- ✅ **Fallback automático** - ativa quando Gemini atinge quota

## 📋 Passo a Passo

### 1. Criar Conta na Groq

1. Acesse: https://console.groq.com/
2. Clique em **"Sign Up"** ou **"Get Started"**
3. Faça login com sua conta Google ou crie uma nova conta

### 2. Obter API Key

1. Após fazer login, vá para: https://console.groq.com/keys
2. Clique em **"Create API Key"**
3. Dê um nome para a chave (ex: "PLEGIMENTORIA")
4. Clique em **"Submit"**
5. **COPIE A CHAVE** - ela só aparece uma vez!

### 3. Configurar no Projeto

#### Opção A: Arquivo .env (Local)

1. Crie ou edite o arquivo `.env` na raiz do projeto
2. Adicione a linha:
   ```
   VITE_GROQ_API_KEY=sua-chave-aqui
   ```
3. Substitua `sua-chave-aqui` pela chave que você copiou
4. Reinicie o servidor de desenvolvimento

#### Opção B: Vercel (Produção)

1. Acesse: https://vercel.com/dashboard
2. Selecione seu projeto
3. Vá em **Settings** → **Environment Variables**
4. Clique em **"Add New"**
5. Nome: `VITE_GROQ_API_KEY`
6. Valor: Cole sua chave da Groq
7. Selecione os ambientes (Production, Preview, Development)
8. Clique em **"Save"**
9. Faça um novo deploy para aplicar as mudanças

## 🔄 Como Funciona o Fallback

1. **Primeiro**: Sistema tenta usar Gemini (sua API key atual)
2. **Se Gemini atingir quota**: Sistema automaticamente usa Groq
3. **Indicador visual**: Aparece "⚡ Usando Groq (fallback)" no chat
4. **Transparente**: O usuário não percebe diferença, apenas funciona!

## ⚙️ Modelo Usado

O sistema usa o modelo **`llama-3.3-70b-versatile`** da Groq, que é:
- Rápido e eficiente
- Boa qualidade de respostas
- Sem custo no free tier

## 🆘 Troubleshooting

### Erro: "GROQ_API_KEY não configurada"
- Verifique se adicionou a variável no `.env` ou Vercel
- Certifique-se que o nome está correto: `VITE_GROQ_API_KEY`
- Reinicie o servidor após adicionar no `.env`

### Groq não está funcionando
- Verifique se a API key está correta
- Confira se não há espaços extras na chave
- Veja o console do navegador para erros específicos

### Quer usar apenas Groq?
- Você pode remover a `VITE_GEMINI_API_KEY` e usar só Groq
- O sistema funcionará normalmente, mas sem fallback

## 📊 Limites do Free Tier Groq

- **Rate Limit**: 30 requisições/segundo
- **Sem limite diário**: Pode fazer milhares de requisições por dia
- **Modelos disponíveis**: Llama 3, Mixtral, etc.
- **Custo**: Gratuito no free tier

## ✅ Pronto!

Após configurar, o sistema automaticamente usará Groq quando o Gemini atingir o limite diário. Não precisa fazer mais nada!

