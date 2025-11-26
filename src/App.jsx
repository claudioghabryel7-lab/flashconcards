import { Navigate, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import FloatingAIChat from './components/FloatingAIChat'
import SupportButton from './components/SupportButton'
import { useAuth } from './hooks/useAuth'
import { useDarkMode } from './hooks/useDarkMode.jsx'
import AdminPanel from './routes/AdminPanel'
import Dashboard from './routes/Dashboard'
import FlashcardView from './routes/FlashcardView'
import Login from './routes/Login'
import PublicHome from './routes/PublicHome'
import SetupUser from './routes/SetupUser'

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading, isAdmin } = useAuth()

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
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/flashcards"
            element={
              <ProtectedRoute>
                <FlashcardView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminPanel />
              </ProtectedRoute>
            }
          />
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
      <SupportButton />
    </div>
  )
}

export default App
