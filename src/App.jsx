import { lazy, Suspense, startTransition } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useDarkMode } from './hooks/useDarkMode.jsx'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import Header from './components/Header'
import SupportButton from './components/SupportButton'
import PopupBanner from './components/PopupBanner'
import OfflineIndicator from './components/OfflineIndicator'
import Logo from './components/Logo.jsx'
// PublicHome importado diretamente (sem lazy loading) para melhor performance na página inicial
import PublicHome from './routes/PublicHome'
// SharedFlashcardPIP importado diretamente (sem lazy loading) para funcionar imediatamente
import SharedFlashcardPIP from './components/SharedFlashcardPIP'

// Lazy load de rotas pesadas
const AdminPanel = lazy(() => import('./routes/AdminPanel'))
const Dashboard = lazy(() => import('./routes/Dashboard'))
const Login = lazy(() => import('./routes/Login'))
const SetupUser = lazy(() => import('./routes/SetupUser'))
const QuestionView = lazy(() => import('./routes/QuestionView'))
const ResetPassword = lazy(() => import('./routes/ResetPassword'))
const Payment = lazy(() => import('./routes/Payment'))
const CourseSelector = lazy(() => import('./components/CourseSelector'))
const CourseShare = lazy(() => import('./routes/CourseShare'))
const ConCurseiroSocial = lazy(() => import('./routes/ConCurseiroSocial'))
const UserProfile = lazy(() => import('./routes/UserProfile'))
const NewsView = lazy(() => import('./routes/NewsView'))
const BlogNewsView = lazy(() => import('./routes/BlogNewsView'))
const Simulado = lazy(() => import('./routes/Simulado'))
const SimuladoShare = lazy(() => import('./routes/SimuladoShare'))
const TreinoRedacao = lazy(() => import('./routes/TreinoRedacao'))
const VesperaDeProva = lazy(() => import('./routes/VesperaDeProva'))
const VesperaDeProvaConfig = lazy(() => import('./routes/VesperaDeProvaConfig'))
const GuiaEstudos = lazy(() => import('./routes/GuiaEstudos'))
const TestTrial = lazy(() => import('./routes/TestTrial'))
const Mentoria = lazy(() => import('./routes/Mentoria'))
const MateriaRevisada = lazy(() => import('./routes/MateriaRevisada'))
const MateriaRevisadaView = lazy(() => import('./routes/MateriaRevisadaView'))
const ConteudoCompleto = lazy(() => import('./routes/ConteudoCompleto'))
const ConteudoCompletoView = lazy(() => import('./routes/ConteudoCompletoView'))
const ConteudoCompletoTopicoView = lazy(() => import('./routes/ConteudoCompletoTopicoView'))
const ConteudoIncidenciaView = lazy(() => import('./routes/ConteudoIncidenciaView'))
const PraticaIncidenciaView = lazy(() => import('./routes/PraticaIncidenciaView'))
const QuestoesTopicoView = lazy(() => import('./routes/QuestoesTopicoView'))
const RankingSimulado = lazy(() => import('./routes/RankingSimulado'))
const EditalVerticalizado = lazy(() => import('./routes/EditalVerticalizado'))
const FlashcardView = lazy(() => import('./routes/FlashcardView'))
const FlashcardsTopicoView = lazy(() => import('./routes/FlashcardsTopicoView'))
const FlashcardPIP = lazy(() => import('./routes/FlashcardPIP'))
const FlashQuestoes = lazy(() => import('./routes/FlashQuestoes'))
const Cursos = lazy(() => import('./routes/Cursos'))
const Demo = lazy(() => import('./routes/Demo'))
// Importação direta para testar
import CalendarioProgresso from './routes/CalendarioProgresso'
const Tutorial = lazy(() => import('./routes/Tutorial'))
const Sitemap = lazy(() => import('./routes/Sitemap'))
const BlankPage = lazy(() => import('./routes/BlankPage'))
const BlankLayout = lazy(() => import('./components/blog/BlankLayout'))
const ListaArtigos = lazy(() => import('./routes/ListaArtigos'))
const PoliticaPrivacidade = lazy(() => import('./routes/PoliticaPrivacidade'))

const ProtectedRoute = ({ children, adminOnly = false, requireCourseSelection = false }) => {
  const { user, profile, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-lg font-semibold text-alego-600">
        Carregando...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  // Se precisa de seleção de curso e ainda não selecionou, redirecionar
  if (requireCourseSelection && profile && profile.selectedCourseId === undefined) {
    return <Navigate to="/select-course" replace />
  }

  return children
}

const GuestOnlyRoute = ({ children }) => {
  const { user, loading } = useAuth()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const trialToken = searchParams.get('trial')

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-lg font-semibold text-alego-600">
        Carregando...
      </div>
    )
  }

  // Se há token de trial, permitir acesso mesmo se usuário estiver autenticado
  // (para permitir que usuários já autenticados se registrem no trial)
  if (user && !trialToken) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function App() {
  try {
    const { darkMode } = useDarkMode()
    const { user } = useAuth()
    const location = useLocation()
    
    // Rastrear status online/offline
    useOnlineStatus()
    
    // Verificar se é a página em branco (sem Header/Footer do site principal)
    const isBlankPage = location.pathname.startsWith('/blank')
    // Verificar se é página PIP (sem Header/Footer)
    const isPIPPage = location.pathname.startsWith('/flashcards/pip') || location.pathname.startsWith('/share-flashcards')
    
    // Loading component otimizado
    const LoadingFallback = () => (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Carregando...</p>
        </div>
      </div>
    )
    
    // Se for página em branco, renderizar com BlankLayout (tem seu próprio Header/Footer)
    // EXCEÇÃO: Se for /blank com ?admin=true, usar BlankPage antigo (tem admin integrado)
    if (isBlankPage) {
      const searchParams = new URLSearchParams(location.search)
      const isAdminMode = searchParams.get('admin') === 'true'
      
      // Se for modo admin, usar BlankPage antigo (com admin integrado)
      if (isAdminMode) {
        return (
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/blank" element={<BlankPage />} />
            </Routes>
          </Suspense>
        )
      }
      
      // Caso contrário, usar novo layout
      return (
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/blank" element={<BlankLayout />}>
              <Route index element={<ListaArtigos />} />
              <Route path="noticia/:articleId" element={<BlogNewsView />} />
            </Route>
            {/* Rota antiga para compatibilidade (admin) */}
            <Route path="/blank/admin" element={<BlankPage />} />
          </Routes>
        </Suspense>
      )
    }
    
    return (
      <div 
        className="min-h-screen transition-colors"
        style={{
          backgroundColor: darkMode ? '#09090b' : '#1e3a5a',
          color: '#fafafa',
          minHeight: '100vh'
        }}
      >
      {!isPIPPage && <Header />}
      <main className="mx-auto w-full max-w-7xl px-3 sm:px-4 lg:px-6 py-4 sm:py-6 md:py-8 overflow-x-hidden relative z-10">
        <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<PublicHome />} />
          <Route path="/cursos" element={<Cursos />} />
          <Route path="/demo" element={<Demo />} />
          {/* Página de Compartilhamento de Flashcards - Acessível sem login */}
          <Route path="/share-flashcards/:token" element={<SharedFlashcardPIP />} />
          <Route path="/guia-estudos" element={<GuiaEstudos />} />
          <Route path="/setup" element={<SetupUser />} />
          <Route
            path="/login"
            element={
              <GuestOnlyRoute>
                <Login />
              </GuestOnlyRoute>
            }
          />
          <Route
            path="/select-course"
            element={
              <ProtectedRoute>
                <CourseSelector />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requireCourseSelection>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/flashcards"
            element={
              <ProtectedRoute requireCourseSelection>
                <FlashcardView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/flashcards/topico/:courseId"
            element={
              <ProtectedRoute requireCourseSelection>
                <FlashcardsTopicoView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/flashcards/pip/:courseId"
            element={
              <ProtectedRoute requireCourseSelection>
                <FlashcardPIP />
              </ProtectedRoute>
            }
          />
          <Route
            path="/flashquestoes"
            element={
              <ProtectedRoute requireCourseSelection>
                <FlashQuestoes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/flashquestoes/responder"
            element={
              <ProtectedRoute>
                <QuestionView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/simulado"
            element={
              <ProtectedRoute requireCourseSelection>
                <Simulado />
              </ProtectedRoute>
            }
          />
          <Route
            path="/treino-redacao"
            element={
              <ProtectedRoute requireCourseSelection>
                <TreinoRedacao />
              </ProtectedRoute>
            }
          />
          <Route
            path="/vespera-de-prova"
            element={<VesperaDeProva />}
          />
          <Route
            path="/vespera-de-prova/configurar/:courseId"
            element={
              <ProtectedRoute requireCourseSelection={false}>
                <VesperaDeProvaConfig />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mentoria"
            element={
              <ProtectedRoute requireCourseSelection>
                <Mentoria />
              </ProtectedRoute>
            }
          />
                    <Route
            path="/materia-revisada"
            element={
              <ProtectedRoute requireCourseSelection>
                <MateriaRevisada />
              </ProtectedRoute>
            }
          />
          <Route
            path="/materia-revisada/:materiaId"
            element={
              <ProtectedRoute requireCourseSelection>
                <MateriaRevisadaView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/conteudo-completo"
            element={
              <ProtectedRoute requireCourseSelection>
                <ConteudoCompleto />
              </ProtectedRoute>
            }
          />
          <Route
            path="/conteudo-completo/:conteudoId"
            element={
              <ProtectedRoute requireCourseSelection>
                <ConteudoCompletoView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/conteudo-completo/topic/:courseId/:topicKey"
            element={
              <ProtectedRoute requireCourseSelection>
                <ConteudoCompletoTopicoView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/questoes-topic/:courseId/:topicKey"
            element={
              <ProtectedRoute requireCourseSelection>
                <QuestoesTopicoView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/edital-verticalizado"
            element={
              <ProtectedRoute requireCourseSelection>
                <EditalVerticalizado />
              </ProtectedRoute>
            }
          />
          <Route
            path="/conteudo-incidencia/:courseId/:disciplinaIdx"
            element={
              <ProtectedRoute requireCourseSelection>
                <ConteudoIncidenciaView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pratica-incidencia/:courseId/:disciplinaIdx"
            element={
              <ProtectedRoute requireCourseSelection>
                <PraticaIncidenciaView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendario"
            element={
              <ProtectedRoute requireCourseSelection>
                <CalendarioProgresso />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tutorial"
            element={
              <ProtectedRoute>
                <Tutorial />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ranking-simulado"
            element={
              <ProtectedRoute requireCourseSelection>
                <RankingSimulado />
              </ProtectedRoute>
            }
          />
          <Route
            path="/feed"
            element={
              <ProtectedRoute requireCourseSelection={false}>
                <ConCurseiroSocial />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile/:userId"
            element={
              <ProtectedRoute requireCourseSelection={false}>
                <UserProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly requireCourseSelection={false}>
                <AdminPanel />
              </ProtectedRoute>
            }
          />
          {/* Rota oculta de redefinição de senha */}
          <Route path="/reset/:token" element={<ResetPassword />} />
          {/* Página de Pagamento - Acessível sem login */}
          <Route path="/pagamento" element={<Payment />} />
          {/* Página de Compartilhamento de Curso - Acessível sem login */}
          <Route path="/curso/:courseId" element={<CourseShare />} />
          {/* Página de Leitura de Notícia - Acessível sem login */}
          <Route path="/noticia/:postId" element={<NewsView />} />
          {/* Página de Simulado Compartilhado - Acessível sem login */}
          <Route path="/simulado-share/:simuladoId" element={<SimuladoShare />} />
          {/* Página de Teste Gratuito - Acessível sem login */}
          <Route path="/teste/:token" element={<TestTrial />} />
          {/* Sitemap XML - Acessível sem login */}
          <Route path="/sitemap.xml" element={<Sitemap />} />
          <Route path="/politica-privacidade" element={<PoliticaPrivacidade />} />
          {/* Rotas do blog são tratadas acima no isBlankPage */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
      {!isPIPPage && (
        <footer className="mx-auto w-full max-w-7xl px-3 sm:px-4 lg:px-6 pb-6 pt-4">
          <div className="glass rounded-xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Logo size="sm" />
            </div>
            <p className="text-xs sm:text-sm text-text-secondary">
              © {new Date().getFullYear()} ConCursos2.5. Todos os direitos reservados.
            </p>
            <p className="text-[10px] sm:text-xs text-text-muted mt-1">
              É proibida a reprodução, distribuição ou uso do conteúdo deste site sem autorização expressa.
            </p>
          </div>
        </footer>
      )}
      {!isPIPPage && <SupportButton />}
      {!isPIPPage && <PopupBanner />}
      {!isPIPPage && <OfflineIndicator />}
    </div>
    )
  } catch (error) {
    // Garantir que o erro seja convertido para string antes de logar
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (import.meta.env.DEV) {
      console.error('Erro no componente App:', errorMessage)
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Erro ao carregar aplicação</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-4">{errorMessage || 'Erro desconhecido'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700"
          >
            Recarregar
          </button>
        </div>
      </div>
    )
  }
}

export default App
