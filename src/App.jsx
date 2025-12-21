import { lazy, Suspense, startTransition } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useDarkMode } from './hooks/useDarkMode.jsx'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import Header from './components/Header'
import SupportButton from './components/SupportButton'
import PopupBanner from './components/PopupBanner'
import BackgroundAnimation from './components/BackgroundAnimation'

// Lazy load de rotas pesadas
const AdminPanel = lazy(() => import('./routes/AdminPanel'))
const Dashboard = lazy(() => import('./routes/Dashboard'))
const FlashcardView = lazy(() => import('./routes/FlashcardView'))
const Login = lazy(() => import('./routes/Login'))
const PublicHome = lazy(() => import('./routes/PublicHome'))
const SetupUser = lazy(() => import('./routes/SetupUser'))
const FlashQuestoes = lazy(() => import('./routes/FlashQuestoes'))
const QuestionView = lazy(() => import('./routes/QuestionView'))
const ResetPassword = lazy(() => import('./routes/ResetPassword'))
const Payment = lazy(() => import('./routes/Payment'))
const CourseSelector = lazy(() => import('./components/CourseSelector'))
const CourseShare = lazy(() => import('./routes/CourseShare'))
const MindMapView = lazy(() => import('./routes/MindMapView'))
const SocialFeed = lazy(() => import('./routes/SocialFeed'))
const UserProfile = lazy(() => import('./routes/UserProfile'))
const NewsView = lazy(() => import('./routes/NewsView'))
const Simulado = lazy(() => import('./routes/Simulado'))
const SimuladoShare = lazy(() => import('./routes/SimuladoShare'))
const TreinoRedacao = lazy(() => import('./routes/TreinoRedacao'))
const GuiaEstudos = lazy(() => import('./routes/GuiaEstudos'))
const TestTrial = lazy(() => import('./routes/TestTrial'))
const MateriaRevisada = lazy(() => import('./routes/MateriaRevisada'))
const MateriaRevisadaView = lazy(() => import('./routes/MateriaRevisadaView'))
const ConteudoCompleto = lazy(() => import('./routes/ConteudoCompleto'))
const ConteudoCompletoView = lazy(() => import('./routes/ConteudoCompletoView'))
const ConteudoCompletoTopicoView = lazy(() => import('./routes/ConteudoCompletoTopicoView'))
const RankingSimulado = lazy(() => import('./routes/RankingSimulado'))
const EditalVerticalizado = lazy(() => import('./routes/EditalVerticalizado'))

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
    
    // Rastrear status online/offline
    useOnlineStatus()
    
    // Loading component otimizado
    const LoadingFallback = () => (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Carregando...</p>
        </div>
      </div>
    )
    
    return (
      <div 
        className="min-h-screen transition-colors"
        style={{
          backgroundColor: darkMode ? '#0f172a' : '#f8fafc',
          color: darkMode ? '#f1f5f9' : '#1e293b',
          minHeight: '100vh'
        }}
      >
      <BackgroundAnimation />
      <Header />
      <main className="mx-auto w-full max-w-6xl px-2 sm:px-4 py-4 sm:py-6 md:py-8 overflow-x-hidden relative z-10">
        <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<PublicHome />} />
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
            path="/mapas-mentais"
            element={
              <ProtectedRoute requireCourseSelection>
                <MindMapView />
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
            path="/edital-verticalizado"
            element={
              <ProtectedRoute requireCourseSelection>
                <EditalVerticalizado />
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
                <SocialFeed />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 min-h-[60px] flex items-center justify-center">
        <p>
          © {new Date().getFullYear()} FlashConCards. Todos os direitos reservados.
          É proibida a reprodução, distribuição ou uso do conteúdo deste site sem autorização expressa.
        </p>
      </footer>
      <SupportButton />
      <PopupBanner />
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
