/**
 * Gera páginas Next.js finas que importam componentes legacy do Vite/React Router.
 * Execute: node scripts/generate-next-pages.mjs
 */

import fs from 'fs'
import path from 'path'

const root = path.resolve(process.cwd(), 'src/app')

const routes = [
  { path: 'demo/page.tsx', importPath: '@/routes/Demo', name: 'DemoPage' },
  { path: 'login/page.tsx', importPath: '@/routes/Login', name: 'LoginPage', guestOnly: true },
  { path: 'setup/page.tsx', importPath: '@/routes/SetupUser', name: 'SetupPage' },
  { path: 'pagamento/page.tsx', importPath: '@/routes/Payment', name: 'PaymentPage' },
  { path: 'politica-privacidade/page.tsx', importPath: '@/routes/PoliticaPrivacidade', name: 'PoliticaPage' },
  { path: 'guia-estudos/page.tsx', importPath: '@/routes/GuiaEstudos', name: 'GuiaEstudosPage' },
  { path: 'select-course/page.tsx', importPath: '@/components/CourseSelector', name: 'SelectCoursePage', protected: true },
  { path: 'dashboard/page.tsx', importPath: '@/routes/Dashboard', name: 'DashboardPage', protected: true, requireCourseSelection: true },
  { path: 'flashcards/page.tsx', importPath: '@/routes/FlashcardView', name: 'FlashcardsPage', protected: true, requireCourseSelection: true },
  { path: 'flashquestoes/page.tsx', importPath: '@/routes/FlashQuestoes', name: 'FlashQuestoesPage', protected: true, requireCourseSelection: true },
  { path: 'flashquestoes/responder/page.tsx', importPath: '@/routes/QuestionView', name: 'QuestionViewPage', protected: true },
  { path: 'simulado/page.tsx', importPath: '@/routes/Simulado', name: 'SimuladoPage', protected: true, requireCourseSelection: true },
  { path: 'treino-redacao/page.tsx', importPath: '@/routes/TreinoRedacao', name: 'TreinoRedacaoPage', protected: true, requireCourseSelection: true },
  { path: 'vespera-de-prova/page.tsx', importPath: '@/routes/VesperaDeProva', name: 'VesperaPage' },
  { path: 'mentoria/page.tsx', importPath: '@/routes/Mentoria', name: 'MentoriaPage', protected: true, requireCourseSelection: true },
  { path: 'materia-revisada/page.tsx', importPath: '@/routes/MateriaRevisada', name: 'MateriaRevisadaPage', protected: true, requireCourseSelection: true },
  { path: 'conteudo-completo/page.tsx', importPath: '@/routes/ConteudoCompleto', name: 'ConteudoCompletoPage', protected: true, requireCourseSelection: true },
  { path: 'edital-verticalizado/page.tsx', importPath: '@/routes/EditalVerticalizado', name: 'EditalPage', protected: true, requireCourseSelection: true },
  { path: 'calendario/page.tsx', importPath: '@/routes/CalendarioProgresso', name: 'CalendarioPage', protected: true, requireCourseSelection: true },
  { path: 'tutorial/page.tsx', importPath: '@/routes/Tutorial', name: 'TutorialPage', protected: true },
  { path: 'ranking-simulado/page.tsx', importPath: '@/routes/RankingSimulado', name: 'RankingPage', protected: true, requireCourseSelection: true },
  { path: 'admin/page.tsx', importPath: '@/routes/AdminPanel', name: 'AdminPage', protected: true, adminOnly: true },
  { path: 'guia-mentorado/page.tsx', importPath: '@/routes/GuiaMentorado', name: 'GuiaMentoradoPage', protected: true, requireCourseSelection: true },
  { path: 'flashcards/topico/[courseId]/page.tsx', importPath: '@/routes/FlashcardsTopicoView', name: 'FlashcardsTopicoPage', protected: true, requireCourseSelection: true },
  { path: 'flashcards/pip/[courseId]/page.tsx', importPath: '@/routes/FlashcardPIP', name: 'FlashcardPIPPage', protected: true, requireCourseSelection: true },
  { path: 'share-flashcards/[token]/page.tsx', importPath: '@/components/SharedFlashcardPIP', name: 'ShareFlashcardsPage' },
  { path: 'share-questao/[questaoId]/page.tsx', importPath: '@/routes/SharedQuestaoView', name: 'ShareQuestaoPage' },
  { path: 'noticia/[postId]/page.tsx', importPath: '@/routes/NewsView', name: 'NewsPage' },
  { path: 'simulado-share/[simuladoId]/page.tsx', importPath: '@/routes/SimuladoShare', name: 'SimuladoSharePage' },
  { path: 'teste/[token]/page.tsx', importPath: '@/routes/TestTrial', name: 'TestTrialPage' },
  { path: 'reset/[token]/page.tsx', importPath: '@/routes/ResetPassword', name: 'ResetPasswordPage' },
  { path: 'curso-share/[courseId]/page.tsx', importPath: '@/routes/CourseShare', name: 'CourseSharePage' },
  { path: 'materia-revisada/[materiaId]/page.tsx', importPath: '@/routes/MateriaRevisadaView', name: 'MateriaRevisadaViewPage', protected: true, requireCourseSelection: true },
  { path: 'conteudo-completo/[conteudoId]/page.tsx', importPath: '@/routes/ConteudoCompletoView', name: 'ConteudoCompletoViewPage', protected: true, requireCourseSelection: true },
  { path: 'conteudo-completo/topic/[courseId]/[topicKey]/page.tsx', importPath: '@/routes/ConteudoCompletoTopicoView', name: 'ConteudoTopicoPage', protected: true, requireCourseSelection: true },
  { path: 'questoes-topic/[courseId]/[topicKey]/page.tsx', importPath: '@/routes/QuestoesTopicoView', name: 'QuestoesTopicoPage', protected: true, requireCourseSelection: true },
  { path: 'conteudo-incidencia/[courseId]/[disciplinaIdx]/page.tsx', importPath: '@/routes/ConteudoIncidenciaView', name: 'ConteudoIncidenciaPage', protected: true, requireCourseSelection: true },
  { path: 'pratica-incidencia/[courseId]/[disciplinaIdx]/page.tsx', importPath: '@/routes/PraticaIncidenciaView', name: 'PraticaIncidenciaPage', protected: true, requireCourseSelection: true },
  { path: 'vespera-de-prova/configurar/[courseId]/page.tsx', importPath: '@/routes/VesperaDeProvaConfig', name: 'VesperaConfigPage', protected: true },
  { path: 'profile/[userId]/page.tsx', importPath: '@/routes/UserProfile', name: 'UserProfilePage', protected: true },
  { path: 'guia-mentorado/[courseId]/[date]/page.tsx', importPath: '@/routes/GuiaMentoradoDiaView', name: 'GuiaMentoradoDiaPage', protected: true, requireCourseSelection: true },
]

function buildPage(route) {
  const needsLegacy = route.protected || route.guestOnly
  const props = []
  if (route.adminOnly) props.push('adminOnly')
  if (route.requireCourseSelection) props.push('requireCourseSelection')
  if (route.guestOnly) props.push('guestOnly')

  if (needsLegacy) {
    return `'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ${route.name}Component from '${route.importPath}'

export default function ${route.name}() {
  return (
    <LegacyPage
      component={${route.name}Component}
      ${props.map((p) => `${p}`).join('\n      ')}
    />
  )
}
`
  }

  return `'use client'

import ${route.name}Component from '${route.importPath}'

export default function ${route.name}() {
  return <${route.name}Component />
}
`
}

for (const route of routes) {
  const filePath = path.join(root, route.path)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, buildPage(route))
  console.log('created', route.path)
}

console.log('Done:', routes.length, 'pages')
