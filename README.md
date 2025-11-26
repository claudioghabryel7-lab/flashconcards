# 🎓 Preparatório Flash - Sistema de Mentoria para ALEGO Policial Legislativo

Sistema completo de mentoria intensiva para o concurso da ALEGO (Assembleia Legislativa de Goiás) - Policial Legislativo, com flashcards interativos, sistema de repetição espaçada (SRS) e mentor IA personalizado.

## 🚀 Tecnologias

- **React + Vite** - Framework frontend
- **JavaScript** - Linguagem de programação
- **TailwindCSS** - Framework CSS utilitário
- **React Router DOM** - Roteamento
- **Firebase Authentication** - Autenticação de usuários
- **Firebase Firestore** - Banco de dados NoSQL
- **Framer Motion** - Animações (flashcards)
- **Heroicons** - Ícones
- **Dayjs** - Manipulação de datas
- **Google Generative AI (Gemini)** - IA para mentor personalizado

## 📋 Funcionalidades

### Para Alunos
- ✅ **Sistema de Flashcards** com animação de flip
- ✅ **Repetição Espaçada (SRS)** - Algoritmo inteligente de revisão
- ✅ **Dashboard** com métricas de progresso
- ✅ **Calendário de Estudos** com contador de dias consecutivos
- ✅ **Favoritos** - Marcar cards importantes
- ✅ **Mentor IA** - Chat com análise automática de progresso
- ✅ **Modo Escuro** - Interface adaptável
- ✅ **Timer de Estudo** - Rastreamento automático de tempo

### Para Administradores
- ✅ **Painel Administrativo** - Gerenciamento completo
- ✅ **Criar/Editar/Excluir Flashcards** - Organização por matéria e módulo
- ✅ **Gerenciar Usuários** - Criar contas de alunos
- ✅ **Importar Flashcards via JSON** - Importação em massa
- ✅ **Configurar IA** - Personalizar informações do concurso

## 🛠️ Instalação

### 1. Clone o repositório

```bash
git clone https://gitlab.com/claudioghabryel7/preparatorioflashconcards.git
cd preparatorioflashconcards
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

Edite o arquivo `.env` e preencha com suas credenciais:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=sua_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu_projeto_id
VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
VITE_FIREBASE_APP_ID=seu_app_id

# Gemini API Configuration
VITE_GEMINI_API_KEY=sua_gemini_api_key_aqui
```

### 4. Configure o Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com)
2. Ative **Authentication** (Email/Password)
3. Crie um banco **Firestore** em modo de produção
4. Configure as regras de segurança (veja `firestore.rules`)
5. Copie as credenciais para o arquivo `.env`

### 5. Configure a API do Gemini

1. Acesse [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Crie uma API key
3. Cole no arquivo `.env` como `VITE_GEMINI_API_KEY`

### 6. Execute o projeto

```bash
npm run dev
```

O projeto estará disponível em `http://localhost:5173`

## 📚 Estrutura do Projeto

```
src/
├── components/          # Componentes reutilizáveis
│   ├── FlashcardItem.jsx
│   ├── FlashcardList.jsx
│   ├── FloatingAIChat.jsx
│   ├── Header.jsx
│   ├── ProgressCalendar.jsx
│   └── SupportButton.jsx
├── firebase/           # Configuração do Firebase
│   └── config.js
├── hooks/              # Hooks customizados
│   ├── useAuth.js
│   ├── useDarkMode.jsx
│   └── useStudyTimer.js
├── routes/             # Páginas/rotas
│   ├── AdminPanel.jsx
│   ├── Dashboard.jsx
│   ├── FlashcardView.jsx
│   ├── Login.jsx
│   ├── PublicHome.jsx
│   └── Register.jsx
├── App.jsx             # Componente principal
├── main.jsx            # Entry point
└── index.css           # Estilos globais
```

## 🔐 Segurança

- ✅ Autenticação via Firebase Authentication
- ✅ Regras de segurança do Firestore configuradas
- ✅ Diferenciação entre usuários comuns e administradores
- ✅ Proteção de rotas administrativas

## 📖 Matérias do Concurso

O sistema está organizado para as seguintes matérias:

1. Português
2. Área de Atuação (PL)
3. Raciocínio Lógico
4. Constitucional
5. Administrativo
6. Legislação Estadual
7. Realidade de Goiás
8. Redação

## 🎯 Sistema de Repetição Espaçada (SRS)

O sistema utiliza um algoritmo de repetição espaçada que:

- **Avança cards** quando marcados como "Fácil"
- **Retorna cards** quando marcados como "Difícil"
- **Calcula retroativamente** se houver atraso nas revisões
- **Organiza revisões** em estágios: 1 dia, 3 dias, 7 dias, 14 dias, 30 dias, 60+ dias

## 🤖 Mentor IA

O mentor IA ("Flash Mentor") oferece:

- Análise automática do progresso do aluno
- Sugestões personalizadas de estudo
- Respostas sobre o concurso ALEGO
- Orientação baseada em dados reais de progresso

## 📝 Scripts Disponíveis

```bash
npm run dev          # Inicia servidor de desenvolvimento
npm run build        # Gera build de produção
npm run preview      # Preview do build de produção
npm run lint         # Executa o linter
```

## 🚀 Deploy

### Vercel / Netlify

1. Conecte seu repositório GitLab
2. Configure as variáveis de ambiente no painel
3. Deploy automático a cada push

### Firebase Hosting

```bash
npm run build
firebase deploy
```

## 📄 Licença

Este projeto é privado e destinado ao uso exclusivo da mentoria ALEGO.

## 👨‍💻 Desenvolvido por

Claudio Ghabryel - Sistema de Mentoria ALEGO

---

**⚠️ IMPORTANTE:** Nunca commite o arquivo `.env` com suas credenciais reais!
