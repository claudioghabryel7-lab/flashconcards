# Auditoria completa — FlashConCards (pré-rollback)

**Data:** 20/07/2026  
**Commit de referência (código com estas funções):** `a9744ee` (`Restrict AI to a single Gemini API key…`)  
**Branch deste documento:** `docs/auditoria-pre-rollback-2026-07-20`  
**Produção:** https://www.flashconcards.com.br  
**Firebase:** `plegi-d84c2`  
**Pacote npm:** `concurseiro-preditivo` (UI às vezes “ConCursos2.5”)

> **Como recuperar depois do rollback em `main`:**
> ```bash
> git fetch origin
> git show origin/docs/auditoria-pre-rollback-2026-07-20:docs/AUDITORIA-SITE-COMPLETA-2026-07-20.md
> # ou checkout só deste arquivo:
> git checkout origin/docs/auditoria-pre-rollback-2026-07-20 -- docs/AUDITORIA-SITE-COMPLETA-2026-07-20.md
> ```
> Código completo desta versão: `git checkout a9744ee` ou cherry-pick dos commits listados na seção 12.

---

## 0. Por que este documento existe

A versão em `a9744ee` está com muitos erros. Você vai voltar a um commit antigo onde o site funcionava, **mas sem** várias funções novas (Guia Mentorado avançado, Modo IA, matérias de hoje, liberação sync, pool de 1 chave, etc.).

Este arquivo grava:
1. Como o site inteiro funciona (rotas, Firebase, pagamento, estudo, admin).
2. Todas as funções de IA / geração / extensões.
3. Decisões e bugs fixados nesta conversa longa.
4. Mapa de arquivos para reimplantar depois.

---

## 1. Stack e estrutura

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 16 (App Router) + React 19 |
| Legado | Vite + React Router via `src/lib/react-router-compat.tsx` |
| Estilo | Tailwind 3, Framer Motion |
| Auth/DB | Firebase 12 (Auth, Firestore, Storage, FCM) |
| Backend HTTP | Next API `src/app/api/*` (+ adaptador `server/`) |
| Jobs/crons | Firebase Cloud Functions (`functions/`) + crons Vercel `/api/cron/[job]` |
| IA | Google Gemini (`gemini-2.5-flash` padrão) |
| Pagamentos | Mercado Pago |
| Deploy | Vercel (site) + Firebase (functions/rules) |

### Pastas principais

```
flashconcards/
├── src/
│   ├── app/                 # Next App Router (page.tsx + api/)
│   ├── routes/              # Páginas legadas .jsx
│   ├── components/          # UI, admin/, guiaMentorado/, feed/, cp/
│   ├── hooks/
│   ├── services/            # Firestore + IA + jobs
│   ├── utils/               # gemini*, edital*, pix, etc.
│   ├── firebase/config.js
│   ├── lib/env.js
│   └── App.jsx              # Rotas React Router (legado)
├── functions/generation/    # Jobs IA server-side
├── server/api/              # Bridge Next ↔ handlers CF
├── browser-extension/       # Chrome Modo IA
├── android-admin/           # App WebView admin
├── firestore.rules
├── vercel.json
└── docs/                    # ESTE arquivo
```

**Roteamento híbrido:** em produção, `src/app/**/page.tsx` monta componentes via `LegacyPage.tsx`. Home Next (`src/app/page.tsx` / CPHero) pode diferir de `PublicHome.jsx`.

---

## 2. Autenticação e papéis

- **Firebase Auth** — `src/hooks/useAuth.js`
- Perfil: `users/{uid}`
- **Admin:** `users.role === 'admin'` (e/ou email master hardcoded no código)
- Guards: `ProtectedRoute` (`App.jsx`) e `LegacyPage` (Next)
- Flags: `adminOnly`, `requireCourseSelection`, `skipEmailVerification`
- Curso ativo: `profile.selectedCourseId` → senão `/select-course`
- Email: `/api/auth/email-verification/*` + `emailVerificationCodes`
- Soft-delete: `deleted: true` / `deletedUsers/{uid}`

---

## 3. Rotas (mapa completo)

### Públicas
| Rota | Arquivo |
|------|---------|
| `/` | `app/page.tsx` (landing) / `PublicHome.jsx` legado |
| `/cursos` | `Cursos.jsx` |
| `/demo` | `Demo.jsx` |
| `/guia-estudos` | `GuiaEstudos.jsx` |
| `/login` | `Login.jsx` |
| `/reset/:token` | `ResetPassword.jsx` |
| `/pagamento` | `Payment.jsx` |
| `/curso/:id`, `/adquirir/:id`, `/curso-share/:id` | `CourseShare.jsx` |
| `/noticia/:postId` | `NewsView.jsx` |
| `/share-flashcards/:token` | Shared PIP |
| `/share-questao/:questaoId` | `SharedQuestaoView.jsx` |
| `/simulado-share/:id` | `SimuladoShare.jsx` |
| `/teste/:token` | `TestTrial.jsx` |
| `/vespera-de-prova` | `VesperaDeProva.jsx` |
| `/politica-privacidade` | `PoliticaPrivacidade.jsx` |
| `/blank`, `/blank/noticia/:id` | Blog legado |
| `/sitemap.xml` | `Sitemap.jsx` |

### Onboarding
| Rota | Arquivo |
|------|---------|
| `/verify-email` | `VerifyEmail.jsx` |
| `/setup` | `SetupUser.jsx` |
| `/select-course` | `CourseSelector` |

### Aluno (login + curso)
| Rota | Arquivo | Função |
|------|---------|--------|
| `/dashboard` | `Dashboard.jsx` | Hub 12 módulos |
| `/materias-de-hoje` | `MateriasDeHoje.jsx` | Dia do cronograma + check-in edital (**função nova**) |
| `/flashcards`, `/flashcards/estudar` | `FlashcardView.jsx` | SRS |
| `/flashcards/topico/:courseId` | `FlashcardsTopicoView.jsx` | |
| `/flashcards/pip/:courseId` | `FlashcardPIP.jsx` | |
| `/flashquestoes` | `FlashQuestoes.jsx` | Questões IA locais |
| `/flashquestoes/responder` | `QuestionView.jsx` | BIZU |
| `/resolver-questoes` | `ResolverQuestoesView.jsx` | Questões liberadas |
| `/resolver-material` | `ResolverMaterialView.jsx` | Materiais liberados |
| `/resolver-incidencia` | `ResolverIncidenciaView.jsx` | |
| `/conteudo-incidencia/...` | `ConteudoIncidenciaView.jsx` | |
| `/pratica-incidencia/...` | `PraticaIncidenciaView.jsx` | |
| `/edital-verticalizado` | `EditalVerticalizado.jsx` | Checklist |
| `/guia-mentorado` | `GuiaMentorado.jsx` | Cronograma mentorado |
| `/guia-mentorado/:courseId/:date` | `GuiaMentoradoDiaView.jsx` | |
| `/vespera-de-prova/configurar/:courseId` | `VesperaDeProvaConfig.jsx` | |
| `/treino-redacao` | `TreinoRedacao.jsx` | |
| `/simulado` | `Simulado.jsx` | |
| `/ranking-simulado` | `RankingSimulado.jsx` | |
| `/mentoria` | `Mentoria.jsx` | |
| `/materia-revisada` (+ `/:id`) | `MateriaRevisada*.jsx` | |
| `/conteudo-completo` (+ ids/topic) | `ConteudoCompleto*.jsx` | |
| `/questoes-topic/:courseId/:topicKey` | `QuestoesTopicoView.jsx` | |
| `/calendario` | `CalendarioProgresso.jsx` | |
| `/tutorial` | `Tutorial.jsx` | |
| `/profile/:userId` | `UserProfile.jsx` | |

### Só Next (podem não estar no `App.jsx` Vite)
- `/perfil` — `PerfilConfiguracoes.jsx`
- `/trilha` — `Trilha.jsx`
- `/comunidade`, `/comunidade/publicacao/:id`, `/comunidade/perfil/:id`
- `/curso/[id]/questoes|flashcards|trilha|mapas-mentais|edital-verticalizado|treino-redacao`

### Admin
| Rota | Arquivo |
|------|---------|
| `/admin` | `AdminPanel.jsx` (~20 abas) |
| `/admin/modo-ia` | `AdminModoIaApp.jsx` (**função nova**) |

### APIs (`src/app/api/`)
**Auth:** `create-user`, `email-verification/send|verify`, `password-reset/send|update`  
**Pagamentos:** `mercadopago/public-config|process-brick|webhook`, `payments/create-pix|checkout-preference|process-brick-request|reconcile`  
**IA:** `gemini/generate`, `generate-edital`, `generation/kick|nudge|cancel|list-active`  
**Admin:** `content-automation/run`, `generate-concurso-news`, `emails/broadcast|welcome-retroactive`, `ops-scan`, `ops-chat`  
**Outros:** `health`, `cron/[job]`, `course-cover-assets`, `fetch-remote-image`

---

## 4. Firestore — collections

### Raiz
`users`, `courses`, `transactions`, `paymentBrickRequests`, `courseEntitlements`, `config`, `siteSettings`, `posts`, `blog_articles`, `homeBanners`, `reviews`, `mockReviews`, `testTrials`, `sharedFlashcards`, `sharedSimulados`, `sharedQuestoes`, `vesperaShares`, `userVesperaProgress`, `passwordResetTokens`, `emailVerificationCodes`, `deletedUsers`, `questoesCache`, `explanationsCache`, `mindMapsCache`, `questoesStats`, `editalProgress`, `userEditalProgress`, `studyPlannerRecommendations`, `presence`, `onlineStatus`, `trilhaFeed`, `feedReports`, `follows`, `leads`, `purchaseReviews`, `adminMateriaisConcurso`, `leisCache`, `professorSupervisorQueue|Reviews|History`, `generationResumeQueue`, `generationActiveJobs`, `generationConcurrency`, `broadcastEmailHistory`, `_health`

### `users/{uid}/`
`generationJobs`, `notifications`, `trilha*`, `desempenhoIncidencia`, `desempenhoTopico`, `redacoes*`, `studySessions`, `profilePosts`, `chats/messages`

### `courses/{courseId}/`
`subjects/.../flashcards`, `prompts`, `config`, `cronograma/{YYYY-MM}`, `mentoradoAutomation/{date}`, `generationCheckpoints`, `materialApoio`, `praticaIncidencia`, `vesperaProva`, `editalVerticalizado` (+ `principal`, `part_*`), `materiasRevisadas`, `conteudosCompletos`, `topicoStatus`, `questoesTopico`, `questoes`, `flashcards`, `conteudosIncidencia`, `questoesIncidencia`, `contentFeedback`, `contentComments`, `guiaMentorado/config`

**Regra crítica:** `courseEntitlements` só Admin SDK (fulfillment MP).

---

## 5. Fluxo de compra (Mercado Pago)

1. `/curso/:id` → `/pagamento?course=...`
2. PIX → `/api/payments/create-pix` + reconcile  
   Cartão Brick → `/api/mercadopago/process-brick` ou fila `paymentBrickRequests`  
   Checkout Pro → preference
3. `transactions/{id}` pending → paid
4. Webhook + cron `reconcile-pix`
5. `mercadopagoPaymentFulfillment.js` → `grantCourseAccess` → `courseEntitlements` + `purchasedCourses`
6. Conta nova opcional + email

Arquivos: `Payment.jsx`, `pixCheckout.js`, handlers em `functions/handlers/*`, `courseAccessExpiry.js`.

---

## 6. Como o aluno estuda (produto)

### Dashboard — 12 atalhos
1. Matérias de hoje (`/materias-de-hoje`) — **nova**
2. Flashcards SRS
3. Resolver Questões
4. Materiais Liberados
5. Incidência
6. Edital Verticalizado
7. Guia Mentorado
8. Véspera de Prova
9. Treino de Redação
10. Trilha
11. Comunidade
12. Progresso (`/calendario`)

### Matérias de hoje (função nova desta linha)
- Arquivos: `MateriasDeHoje.jsx`, `userEditalCheckinService.js`, links `topicContentLinks.js`
- Lê `cronograma/{YYYY-MM}` dia atual (TZ São Paulo)
- Links material / questões / flashcards
- Check-ins sincronizam com progresso do Edital (`userEditalProgress`)

### Liberação conteúdo → aluno só vê `status === 'disponivel'`
Hooks: `useEditalFlashcards`, `useResolverMaterial`, `useResolverQuestoes`, `courseAccess.js`.

---

## 7. Admin — abas (`AdminPanel.jsx ?tab=`)

**Plataforma:** `config`, `users`, `courses`, `moderacao`, `guia-mentorado`, `professor-fiscalizador`, `generation-jobs`, `ops-assistant`  
**Conteúdo:** `flashcards`, `edital`, `material-concurso`, `simulados`, `news`  
**Marketing:** `banners`, `popup`, `reviews`, `trials`, `shared-links`  
**Ferramentas:** `prompt-test`  
**Extra:** `/admin/modo-ia`

Componentes admin chave: `AdminGuiaMentorado`, `AdminProfessorSupervisor`, `AdminGenerationJobs`, `AdminConcursoMaterial`, `AdminAndroidAutomationCard`, `AdminOpsAssistant`, `AdminContentModeration`, `AdminEmailBroadcast`.

---

## 8. Cloud Functions / crons

### Triggers
- `onGenerationJobCreated/Updated` → `users/.../generationJobs`
- `onPaymentBrickRequestCreated`
- `onGenerationResumeQueueWrite`
- `onProfessorFiscalizadorConfigUpdated`

### Schedules (Firebase)
`reconcilePendingPixPayments` (5m), `mentoradoDailyContentRelease` (15m), `contentAutomationTick` (30m), `resumeWaitingGenerationJobs` (10m), `professorSupervisorTick` (10m), `weeklyRedacaoThemeRotation`, `motivationalInactivityPush`, `expireTrialUsers`, `purgeUnverifiedEmails`, `expireCourseAccesses`, `processCourseAutoRenewals`, `scheduledGenerateConcursoNews`

### Crons Vercel (`CRON_SECRET`)
`resume-jobs`, `reconcile-pix`, `expire-trials`, `purge-unverified`, `expire-course-access`, `auto-renewals`, `content-automation`, `mentorado-daily`, `motivational-push`, `professor-supervisor`

---

## 9. IA — política de chave (estado em a9744ee)

**SOMENTE uma chave:**
- Env: `VITE_GEMINI_API_KEY` (= `GEMINI_API_KEY` no server)
- Valor usado localmente nesta sessão: chave tipo `AQ.…` (header `x-goog-api-key` via `geminiHttp.js`)
- **Removido:** `VITE_GEMINI_API_KEY_1…10`, MOTHER/`_MAE`, `VITE_GOOGLE_AI_API_KEY`, **todo Groq**

Arquivos pool:
- `src/utils/geminiKeyPool.js`
- `functions/generation/geminiKeyPool.js`
- `src/utils/geminiHttp.js` / `functions/generation/geminiHttp.js`
- `src/lib/env.js`, `next.config.ts`
- `scripts/sync-gemini-env.mjs`, `sync-vercel-env.mjs`, `export-vercel-env.mjs`

**Após rollback:** reaplicar esta política + limpar vars antigas na Vercel.

---

## 10. Pipeline Guia Mentorado (função central nova)

### Arquivos
| Papel | Path |
|-------|------|
| UI aluno | `src/routes/GuiaMentorado.jsx`, `GuiaMentoradoDiaView.jsx` |
| UI admin | `src/components/admin/AdminGuiaMentorado.jsx` |
| Prompts | `src/utils/guiaMentoradoPrompts.js` |
| Topics/match edital | `src/utils/guiaMentoradoTopics.js` |
| Loader edital | `src/utils/editalVerticalizadoLoader.js` |
| Automação client | `src/services/guiaMentoradoAutomationService.js` |
| Admin ops | `src/services/guiaMentoradoAdminService.js` |
| Scheduler | `src/services/adminOnlineMentoradoScheduler.js` |
| **Processor browser** | `src/services/localJobProcessor.js` |
| Checkpoints | `src/services/localGenerationCheckpoint.js` |
| Runner | `src/services/aiGenerationRunner.js` |
| Jobs | `src/services/generationJobService.js` |
| Publish | `src/services/topicoPublishService.js` |
| CF | `functions/generation/guiaMentorado*.js`, `jobProcessor.js`, `trustedGeneration.js` |

### Jobs (`users/{uid}/generationJobs`)
| jobType | O que faz |
|---------|-----------|
| `guia_mentorado_cronograma` | Gera mês(es) do cronograma |
| `guia_mentorado_automation` | Gera material+questões+FC do dia e publica |
| `guia_mentorado_backfill` | Backfill |

### Steps por tópico (automation)
1. Dossiê opcional (Modo IA / Jina / Gemini Search) — **não bloqueia** se falhar  
2. Material → `conteudosCompletos`  
3. Questões → `questoesTopico/{key}_nivel_1`  
4. Flashcards (lotes) → `flashcards`  
5. Auditoria bundle  
6. `publishTopicAssets` → `setTopicoPublishStatus` → `topicoStatus` + assets `disponivel`

### Cronograma — regras críticas (bugs fixados)
- Fonte do edital: **`courses/{id}/editalVerticalizado/principal`** (NÃO `atual`)
- **Sem Google Search** na geração do cronograma
- Botão admin **aguarda** o job terminar (não “pode fechar”)
- `runOnServer: true` é **ignorado** na prática: job roda **na aba do admin** (`aiGenerationRunner` força local)

### Liberação Mentorado ↔ Edital (bug fixado)
- Antes: marcava “LIBERADO” no mentorado sem alinhar Edital → aluno não via conteúdo  
- Depois: `publishTopicAssets` / `setTopicoPublishStatus` sincroniza `topicoStatus` + status dos docs  
- Semântica: “LIBERADO” no mentorado = botão Liberar do Edital = `CONTENT_STATUS.AVAILABLE` (`disponivel`)  
- Arquivo: `src/utils/contentStatus.js`

### Firestore paths mentorado
```
courses/{id}/editalVerticalizado/principal
courses/{id}/cronograma/{YYYY-MM}.days.{YYYY-MM-DD}
courses/{id}/config/guiaMentorado
courses/{id}/guiaMentorado/config          # paths duplicados — cuidado
courses/{id}/mentoradoAutomation/{date}
courses/{id}/conteudosCompletos/{topicKey}
courses/{id}/questoesTopico/{topicKey}_nivel_{n}
courses/{id}/flashcards/{id}
courses/{id}/generationCheckpoints/...
courses/{id}/topicoStatus/{key}
users/{uid}/generationJobs/{jobId}
```

---

## 11. Modo IA / dossiê / extensões (funções novas)

| Peça | Path |
|------|------|
| Rota | `/admin/modo-ia` → `AdminModoIaApp.jsx` + `app/admin/modo-ia/page.tsx` |
| Dossiê web | `src/services/googleAiWebDossierService.js` (Jina → fallback Gemini+Search) |
| Ponte | `src/services/googleAiBrowserVerifier.js` |
| Chrome | `browser-extension/` (`manifest.json`, `google-agent.js`, `site-bridge.js`, `service-worker.js`) |
| Android | `android-admin/` WebView site + Google `udm=50` |

**Limitação:** Gemini Search ≠ Modo IA real do Google (same-origin). Extensão/Android tentam o Modo IA real; Jina sofre CAPTCHA/429 em datacenter. Geração **continua sem dossiê** se ponte falhar.

---

## 12. Outras superfícies de IA

| Superfície | Arquivos | Search? |
|------------|----------|---------|
| Chat mentor | `FloatingAIChat.jsx`, `AIChat.jsx` | NÃO (podem estar órfãos no layout) |
| Chat vendas | `SalesAssistantChat.jsx` → `/api/gemini/generate` | conforme flag |
| FlashQuestoes + BIZU | `FlashQuestoes.jsx`, `QuestionView.jsx` | geralmente não |
| Capas/descrição curso | `courseCoverAi.js`, `/api/course-cover-assets` | Search para logo |
| Edital IA admin | `AdminPanel.jsx`, `adminEditalProcessor.js` | varia |
| Material/questões tópico | `ConteudoCompletoTopicoView`, `QuestoesTopicoView`, `topicoQuestoesService` | SIM (trusted) |
| Professor fiscalizador | `professorSupervisor*`, `localProfessor*` | |
| Notícias concurso | `generateConcursoNewsHandler` | SIM |
| Véspera | `vesperaProvaProcessor.js` | SIM |
| Ops chat | `/api/admin/ops-chat` | |

Hub cliente: `src/utils/geminiApi.js` (`callGeminiWithRetry`, `generateAiJson`).

### Google Search — quando usar
- **NÃO:** cronograma mentorado, chats mentor, descrição de curso, auditoria JSON (quebra formato)
- **SIM:** material/questões/FC trusted do mentorado, véspera, notícias, capas oficiais, fallback dossiê

---

## 13. Firestore transporte / SSL (fixes)

Problema: `ERR_SSL_PROTOCOL_ERROR` no Listen WebChannel.

Fixes:
- Long-polling + `memoryLocalCache` — `src/firebase/config.js`
- Limpeza SW legado / IndexedDB — `src/utils/firestoreTransportRecovery.js`
- Removido probe ruidoso `GET firestore.googleapis.com/` (404 falso-alarme) — commit `7ddd29c`

Commits: `6cc1e1b`, `5335708`, `7ddd29c`.

---

## 14. Commits desta linha de trabalho (do mais novo ao mais antigo relevante)

| Commit | O quê |
|--------|-------|
| `a9744ee` | 1 chave Gemini; remove Groq/multi-key |
| `9e81c16` | Cronograma lê edital `principal` + aguarda job |
| `aeac37a` | Sem Google Search no cronograma |
| `5226f23` | Rota `/admin/modo-ia` |
| `a183991` | Geração automática no navegador sem app |
| `919e6f4` | Botão 1-clique Android Guia Mentorado |
| `7ddd29c` / `5335708` / `6cc1e1b` | Firestore transport/SSL |
| `9867d1b` | Estudo diário + grounding local |
| `1a402a4` / `74b4b48` | Sync liberação Mentorado ↔ Edital |
| `511d3d3` / `1f88e71` / `47b4a46` | Auditoria publicação (não travar) |
| `604a999` | Dedup jobs (assinatura jobType+curso+tópico+data) |
| `7de3a2a` | JSON mode, Search só auditoria jurídica, retries |

Para reaplicar funções depois do rollback: cherry-pick seletivo destes commits (cuidado com conflitos) ou reimplementar a partir desta auditoria.

---

## 15. Variáveis de ambiente críticas (sem segredos)

```
# Firebase client
VITE_FIREBASE_* / NEXT_PUBLIC_FIREBASE_VAPID_KEY

# Admin SDK
FIREBASE_SERVICE_ACCOUNT_KEY

# Site
NEXT_PUBLIC_SITE_URL

# Gemini — ÚNICA chave de IA
VITE_GEMINI_API_KEY
GEMINI_API_KEY

# Opcional Search Custom (RAG legado / imagens)
VITE_GOOGLE_SEARCH_API_KEY
VITE_GOOGLE_SEARCH_ENGINE_ID
VITE_GEMINI_MODEL

# Email
EMAIL_USER / EMAIL_PASSWORD

# Mercado Pago
MERCADOPAGO_* / NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY

# Crons
CRON_SECRET
```

**NÃO usar mais:** `VITE_GEMINI_API_KEY_1…10`, `VITE_GROQ_API_KEY`, `VITE_GOOGLE_AI_API_KEY`, `*_MAE`.

---

## 16. Extensões auxiliares

### browser-extension/
Chrome MV3; injeta/automata Modo IA Google; ponte `FCC_GOOGLE_AI_*` com o site. Sem backend.

### android-admin/
WebView duplo (admin + Google). Deep link “Abrir no app”. Botão automatizar 1 clique.

---

## 17. Decisões explícitas da conversa (não perder)

1. **Uma API só** — a chave `AQ.…` em `VITE_GEMINI_API_KEY`; apagar as outras.
2. **Groq morto** — nenhum fallback.
3. **Modo IA real** não roda 100% no site puro; precisa extensão/Android; site usa dossiê best-effort.
4. **Jobs de geração mentorado** rodam na **aba do admin**, não “na nuvem” de verdade (mensagem antiga enganava).
5. **Cronograma** = edital `principal` + sem Search + UI espera o job.
6. **Liberar no mentorado** tem que espelhar Edital (`disponivel` / `topicoStatus`).
7. **Matérias de hoje** é card `#00` do dashboard ligado ao cronograma + check-in edital.
8. Você considerou esta versão **cheia de erros** e vai voltar a um build antigo estável — **reimplantar funções depois usando este doc + commit `a9744ee`**.

---

## 18. Checklist para reimplantar depois do rollback

- [ ] Restaurar este arquivo do branch `docs/auditoria-pre-rollback-2026-07-20`
- [ ] Decidir o que trazer: só liberação? só cronograma fix? Modo IA? matérias de hoje? chave única?
- [ ] Cherry-pick ou reimplementar módulo a módulo (começar por `topicoPublishService` + `editalVerticalizadoLoader` + cronograma)
- [ ] Configurar **só** `VITE_GEMINI_API_KEY` na Vercel e redeploy
- [ ] Testar: gerar cronograma → automatizar 1 dia → ver aluno no Edital + Resolver Material/Questões + Matérias de hoje
- [ ] Firestore: confirmar long-polling se SSL voltar a quebrar

---

## 19. Arquivos “não apagar da memória” (núcleo produto)

```
src/App.jsx
src/hooks/useAuth.js
src/firebase/config.js
src/utils/firestoreTransportRecovery.js
src/utils/geminiApi.js
src/utils/geminiHttp.js
src/utils/geminiKeyPool.js
src/utils/editalVerticalizadoLoader.js
src/utils/contentStatus.js
src/utils/guiaMentoradoPrompts.js
src/services/localJobProcessor.js
src/services/topicoPublishService.js
src/services/aiGenerationRunner.js
src/services/generationJobService.js
src/services/userEditalCheckinService.js
src/services/googleAiWebDossierService.js
src/services/googleAiBrowserVerifier.js
src/routes/Dashboard.jsx
src/routes/MateriasDeHoje.jsx
src/routes/GuiaMentorado.jsx
src/routes/EditalVerticalizado.jsx
src/routes/AdminPanel.jsx
src/routes/AdminModoIaApp.jsx
functions/generation/*
browser-extension/*
android-admin/*
```

---

*Fim da auditoria. Gerado para preservar o conhecimento antes do rollback.*
