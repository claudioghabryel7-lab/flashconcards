import { lazy, Suspense, startTransition } from 'react'
import { Navigate, Route, Routes, useLocation, Link } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useDarkMode } from './hooks/useDarkMode.jsx'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import Header from './components/Header'
import SupportButton from './components/SupportButton'
import PopupBanner from './components/PopupBanner'
import OfflineIndicator from './components/OfflineIndicator'
// PublicHome importado diretamente (sem lazy loading) para melhor performance na página inicial
import PublicHome from './routes/PublicHome'

// Lazy load de rotas pesadas
const AdminPanel = lazy(() => import('./routes/AdminPanel'))
const Dashboard = lazy(() => import('./routes/Dashboard'))
const FlashcardView = lazy(() => import('./routes/FlashcardView'))
const Login = lazy(() => import('./routes/Login'))
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
const BlogNewsView = lazy(() => import('./routes/BlogNewsView'))
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
const Sitemap = lazy(() => import('./routes/Sitemap'))
const BlankPage = lazy(() => import('./routes/BlankPage'))
const BlankLayout = lazy(() => import('./components/blog/BlankLayout'))
const ListaArtigos = lazy(() => import('./routes/ListaArtigos'))

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
          backgroundColor: darkMode ? '#0f172a' : '#f8fafc',
          color: darkMode ? '#f1f5f9' : '#1e293b',
          minHeight: '100vh'
        }}
      >
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
          {/* Sitemap XML - Acessível sem login */}
          <Route path="/sitemap.xml" element={<Sitemap />} />
          {/* Rotas do blog são tratadas acima no isBlankPage */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-2 sm:px-4 py-4 sm:py-6 text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-4 sm:mb-6">
          {/* Sobre */}
          <div className="min-w-0">
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white mb-1.5 sm:mb-2">Sobre</h3>
            <ul className="space-y-1 sm:space-y-1.5">
              <li><Link to="/" className="block text-xs hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Início</Link></li>
              <li><Link to="/guia-estudos" className="block text-xs hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Guia de Estudos</Link></li>
              <li><Link to="/blank" className="block text-xs hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Blog e Notícias</Link></li>
              <li><Link to="/pagamento" className="block text-xs hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Planos e Preços</Link></li>
            </ul>
          </div>
          
          {/* Cursos */}
          <div className="min-w-0">
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white mb-1.5 sm:mb-2">Cursos</h3>
            <ul className="space-y-1 sm:space-y-1.5">
              <li><span className="block text-xs text-slate-400 dark:text-slate-600">Polícia Militar (PMGO)</span></li>
              <li><span className="block text-xs text-slate-400 dark:text-slate-600">Polícia Civil (PC)</span></li>
              <li><span className="block text-xs text-slate-400 dark:text-slate-600">Guarda Municipal (GCM)</span></li>
              <li><Link to="/pagamento" className="block text-xs hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Ver Todos os Cursos</Link></li>
            </ul>
          </div>
          
          {/* Recursos */}
          <div className="min-w-0">
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white mb-1.5 sm:mb-2">Recursos</h3>
            <ul className="space-y-1 sm:space-y-1.5">
              <li><span className="block text-xs text-slate-400 dark:text-slate-600">Flashcards Interativos</span></li>
              <li><span className="block text-xs text-slate-400 dark:text-slate-600">Questões Comentadas</span></li>
              <li><span className="block text-xs text-slate-400 dark:text-slate-600">Simulados Online</span></li>
              <li><span className="block text-xs text-slate-400 dark:text-slate-600">Assistente de IA</span></li>
            </ul>
          </div>
          
          {/* Legal */}
          <div className="min-w-0">
            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white mb-1.5 sm:mb-2">Legal</h3>
            <ul className="space-y-1 sm:space-y-1.5">
              <li><span className="block text-xs text-slate-400 dark:text-slate-600">Termos de Uso</span></li>
              <li><span className="block text-xs text-slate-400 dark:text-slate-600">Política de Privacidade</span></li>
            </ul>
          </div>
        </div>
        
        <div className="text-center pt-3 sm:pt-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-[10px] sm:text-xs leading-tight sm:leading-relaxed">
            © {new Date().getFullYear()} FlashConCards (Plegimentoria). Todos os direitos reservados.
            <br className="hidden sm:block" />
            <span className="block sm:inline text-[10px] sm:text-xs mt-0.5 sm:mt-0">É proibida a reprodução, distribuição ou uso do conteúdo deste site sem autorização expressa.</span>
          </p>
        </div>
      </footer>
      <SupportButton />
      <PopupBanner />
      <OfflineIndicator />
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
