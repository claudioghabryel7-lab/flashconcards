import { Navigate, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import FloatingAIChat from './components/FloatingAIChat'
import SalesChat from './components/SalesChat'
import SupportButton from './components/SupportButton'
import PopupBanner from './components/PopupBanner'
import { useAuth } from './hooks/useAuth'
import { useDarkMode } from './hooks/useDarkMode.jsx'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import AdminPanel from './routes/AdminPanel'
import Dashboard from './routes/Dashboard'
import FlashcardView from './routes/FlashcardView'
import Login from './routes/Login'
import PublicHome from './routes/PublicHome'
import Ranking from './routes/Ranking'
import SetupUser from './routes/SetupUser'
import FlashQuestoes from './routes/FlashQuestoes'
import QuestionView from './routes/QuestionView'
import ResetPassword from './routes/ResetPassword'
import Payment from './routes/Payment'
import CourseSelector from './components/CourseSelector'
import CourseShare from './routes/CourseShare'
import MindMapView from './routes/MindMapView'
import SocialFeed from './routes/SocialFeed'
import UserProfile from './routes/UserProfile'
import NewsView from './routes/NewsView'
import Simulado from './routes/Simulado'

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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-lg font-semibold text-alego-600">
        Carregando...
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function App() {
  const { darkMode } = useDarkMode()
  const { user } = useAuth()
  
  // Rastrear status online/offline
  useOnlineStatus()
  
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
        <Routes>
          <Route path="/" element={<PublicHome />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        <p>
          © {new Date().getFullYear()} Plegimentoria Mentoria para Polícia Legislativa ALEGO. Todos os direitos reservados.
          É proibida a reprodução, distribuição ou uso do conteúdo deste site sem autorização expressa.
        </p>
      </footer>
      <FloatingAIChat />
      <SalesChat />
      <SupportButton />
      <PopupBanner />
    </div>
  )
}

export default App
