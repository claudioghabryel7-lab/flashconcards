import { lazy, Suspense, startTransition } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useDarkMode } from './hooks/useDarkMode.jsx'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import Header from './components/Header'
import SupportButton from './components/SupportButton'
import PopupBanner from './components/PopupBanner'

// Lazy load de rotas pesadas
const AdminPanel = lazy(() => import('./routes/AdminPanel'))
const Dashboard = lazy(() => import('./routes/Dashboard'))
const FlashcardView = lazy(() => import('./routes/FlashcardView'))
const Login = lazy(() => import('./routes/Login'))
const PublicHome = lazy(() => import('./routes/PublicHome'))
const Ranking = lazy(() => import('./routes/Ranking'))
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
      <Header />
      <main className="mx-auto w-full max-w-6xl px-2 sm:px-4 py-4 sm:py-6 md:py-8 overflow-x-hidden">
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
            path="/ranking"
            element={
              <ProtectedRoute requireCourseSelection>
                <Ranking />
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
      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        <p>
          © {new Date().getFullYear()} FlashConCards. Todos os direitos reservados.
          É proibida a reprodução, distribuição ou uso do conteúdo deste site sem autorização expressa.
        </p>
      </footer>
      <SupportButton />
      <PopupBanner />
    </div>
  )
}

export default App
