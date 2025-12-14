import { useEffect, useState, useMemo } from 'react'
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore'
import { 
  TrophyIcon, 
  FireIcon, 
  StarIcon,
  ChartBarIcon,
  SparklesIcon
} from '@heroicons/react/24/solid'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const RankingSimulado = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [rankingData, setRankingData] = useState([])
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')

  // Carregar cursos
  useEffect(() => {
    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const snapshot = await getDocs(coursesRef)
        const coursesList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setCourses(coursesList)
        
        // Usar curso do perfil ou primeiro disponível
        const courseId = profile?.selectedCourseId || coursesList[0]?.id || 'alego-default'
        setSelectedCourseId(courseId)
      } catch (err) {
        console.error('Erro ao carregar cursos:', err)
      }
    }
    loadCourses()
  }, [profile])

  // Carregar nome do curso selecionado
  useEffect(() => {
    if (!selectedCourseId) return
    
    const loadCourseName = async () => {
      try {
        const courseDoc = await getDoc(doc(db, 'courses', selectedCourseId))
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || 'Curso')
        }
      } catch (err) {
        console.error('Erro ao carregar nome do curso:', err)
      }
    }
    loadCourseName()
  }, [selectedCourseId])

  // Carregar ranking de simulados
  useEffect(() => {
    if (!selectedCourseId) return

    const loadRanking = async () => {
      try {
        setLoading(true)
        
        // Buscar todos os resultados de simulados do curso
        // Não usar orderBy para evitar necessidade de índice composto
        const statsRef = collection(db, 'questoesStats')
        const q = query(
          statsRef,
          where('courseId', '==', selectedCourseId),
          where('type', '==', 'simulado')
        )
        
        const snapshot = await getDocs(q)
        const results = []
        
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data()
          const userId = docSnap.id.split('_')[0] // Formato: userId_courseId
          
          // Buscar informações do usuário
          try {
            const userDoc = await getDoc(doc(db, 'users', userId))
            if (userDoc.exists()) {
              const userData = userDoc.data()
              if (userData.role !== 'admin') {
                results.push({
                  userId,
                  userName: userData.name || userData.displayName || 'Usuário',
                  userPhoto: userData.photoURL || null,
                  finalScore: parseFloat(data.finalScore || 0),
                  objectiveScore: parseFloat(data.objectiveScore || 0),
                  accuracy: parseFloat(data.accuracy || 0),
                  total: data.total || 0,
                  correct: data.correct || 0,
                  completedAt: data.completedAt || data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                })
              }
            }
          } catch (err) {
            console.warn(`Erro ao carregar usuário ${userId}:`, err)
          }
        }

        // Agrupar por usuário e pegar a melhor nota
        const userBestScores = {}
        results.forEach(result => {
          if (!userBestScores[result.userId] || userBestScores[result.userId].finalScore < result.finalScore) {
            userBestScores[result.userId] = result
          }
        })

        // Converter para array e ordenar por nota (ordenar em memória)
        const ranking = Object.values(userBestScores)
          .sort((a, b) => {
            // Ordenar por nota decrescente
            if (b.finalScore !== a.finalScore) {
              return b.finalScore - a.finalScore
            }
            // Em caso de empate, ordenar por data (mais recente primeiro)
            return new Date(b.completedAt) - new Date(a.completedAt)
          })
          .slice(0, 100) // Limitar a 100 melhores
          .map((user, index) => ({
            ...user,
            position: index + 1
          }))

        // Calcular streaks (quantos simulados consecutivos foram feitos)
        // Buscar todos os simulados do curso (sem orderBy para evitar erro de índice)
        const allSimuladosQuery = query(
          statsRef,
          where('courseId', '==', selectedCourseId),
          where('type', '==', 'simulado')
        )
        
        const allSimuladosSnapshot = await getDocs(allSimuladosQuery)
        const userSimulados = {}
        
        allSimuladosSnapshot.docs.forEach(docSnap => {
          const data = docSnap.data()
          const userId = docSnap.id.split('_')[0]
          
          if (!userSimulados[userId]) {
            userSimulados[userId] = []
          }
          
          userSimulados[userId].push({
            completedAt: data.completedAt || data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            finalScore: parseFloat(data.finalScore || 0)
          })
        })

        // Calcular streak para cada usuário (simulados consecutivos nos últimos dias)
        Object.keys(userSimulados).forEach(userId => {
          const simulados = userSimulados[userId]
            .map(s => ({
              ...s,
              date: new Date(s.completedAt).toISOString().split('T')[0] // Apenas a data (YYYY-MM-DD)
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date))
          
          // Remover duplicatas do mesmo dia (pegar o melhor)
          const uniqueByDate = {}
          simulados.forEach(s => {
            if (!uniqueByDate[s.date] || uniqueByDate[s.date].finalScore < s.finalScore) {
              uniqueByDate[s.date] = s
            }
          })
          const uniqueDates = Object.values(uniqueByDate).sort((a, b) => 
            new Date(a.date) - new Date(b.date)
          )
          
          // Calcular streak: quantos dias consecutivos com simulados (começando do mais recente)
          let streak = 0
          const today = new Date().toISOString().split('T')[0]
          
          // Verificar se tem simulado hoje ou ontem para começar o streak
          let checkDate = new Date()
          checkDate.setHours(0, 0, 0, 0)
          
          while (true) {
            const dateStr = checkDate.toISOString().split('T')[0]
            const hasSimulado = uniqueDates.some(s => s.date === dateStr)
            
            if (hasSimulado) {
              streak++
              checkDate.setDate(checkDate.getDate() - 1) // Dia anterior
            } else {
              break // Streak quebrado
            }
            
            // Limitar a busca a 90 dias atrás
            const daysAgo = Math.floor((new Date() - checkDate) / (1000 * 60 * 60 * 24))
            if (daysAgo > 90) break
          }
          
          const userRanking = ranking.find(r => r.userId === userId)
          if (userRanking) {
            userRanking.streak = streak
            userRanking.totalSimulados = uniqueDates.length
          }
        })

        setRankingData(ranking)
      } catch (err) {
        console.error('Erro ao carregar ranking:', err)
        setRankingData([])
      } finally {
        setLoading(false)
      }
    }

    loadRanking()
  }, [selectedCourseId])

  const userRank = rankingData.findIndex((r) => r.userId === user?.uid) + 1
  const currentUserRank = rankingData.find((r) => r.userId === user?.uid)

  const getMedalColor = (position) => {
    if (position === 1) return 'from-yellow-400 to-yellow-600'
    if (position === 2) return 'from-gray-300 to-gray-500'
    if (position === 3) return 'from-amber-600 to-amber-800'
    return 'from-blue-500 to-blue-700'
  }

  const getPositionIcon = (position) => {
    if (position === 1) return '🥇'
    if (position === 2) return '🥈'
    if (position === 3) return '🥉'
    return position
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent mb-4"></div>
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">Carregando ranking...</p>
        </div>
      </div>
    )
  }

  const top3 = rankingData.slice(0, 3)
  const rest = rankingData.slice(3)

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 rounded-2xl shadow-2xl p-6 sm:p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl -ml-24 -mb-24"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                <TrophyIcon className="h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-2">
                  Ranking de Simulados
                </h1>
                <p className="text-purple-100 text-sm sm:text-base">
                  Classificação baseada na melhor nota de cada aluno
                </p>
              </div>
            </div>
            
            {/* Seletor de Curso */}
            {courses.length > 1 && (
              <select
                value={selectedCourseId || ''}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="bg-white/20 backdrop-blur-sm border-2 border-white/30 rounded-xl px-4 py-2 text-white font-semibold focus:outline-none focus:border-white/50 min-w-[200px]"
              >
                {courses.map(course => (
                  <option key={course.id} value={course.id} className="text-slate-900">
                    {course.name || course.competition || course.id}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Curso selecionado */}
          {courseName && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full">
              <span className="text-sm font-semibold">{courseName}</span>
            </div>
          )}

          {/* Posição do usuário atual */}
          {currentUserRank && (
            <div className="mt-6 p-4 bg-white/20 backdrop-blur-sm rounded-xl border border-white/30">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-black">#{userRank}</div>
                  <div>
                    <div className="font-bold text-lg">{currentUserRank.userName}</div>
                    <div className="text-sm text-purple-100">Sua posição</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  {currentUserRank.streak > 0 && (
                    <div className="flex items-center gap-2">
                      <FireIcon className="h-6 w-6 text-orange-300" />
                      <div>
                        <div className="font-bold">{currentUserRank.streak}</div>
                        <div className="text-xs text-purple-100">Streak</div>
                      </div>
                    </div>
                  )}
                  <div className="text-right">
                    <div className="text-2xl font-black">{currentUserRank.finalScore}</div>
                    <div className="text-xs text-purple-100">Melhor nota</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top 3 Pódio */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* 2º Lugar */}
          {top3[1] && (
            <div className="order-2 md:order-1">
              <div className="relative bg-gradient-to-br from-gray-300 to-gray-500 rounded-2xl p-6 shadow-xl transform hover:scale-105 transition-all">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-br from-gray-300 to-gray-500 rounded-full p-3 shadow-lg">
                  <TrophyIcon className="h-8 w-8 text-white" />
                </div>
                <div className="mt-8 text-center">
                  <div className="text-5xl mb-2">🥈</div>
                  <div className="text-white text-2xl font-black mb-2">2º</div>
                  <div className="text-white text-lg font-bold mb-2 truncate">{top3[1].userName}</div>
                  <div className="text-white/90 text-3xl font-black mb-2">{top3[1].finalScore}</div>
                  {top3[1].streak > 0 && (
                    <div className="flex items-center justify-center gap-1 text-white/80">
                      <FireIcon className="h-4 w-4" />
                      <span className="text-sm font-semibold">{top3[1].streak} streak</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 1º Lugar */}
          {top3[0] && (
            <div className="order-1 md:order-2">
              <div className="relative bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 rounded-2xl p-8 shadow-2xl transform hover:scale-105 transition-all border-4 border-yellow-300">
                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full p-4 shadow-xl animate-pulse">
                  <TrophyIcon className="h-10 w-10 text-white" />
                </div>
                <div className="mt-10 text-center">
                  <div className="text-6xl mb-2">👑</div>
                  <div className="text-white text-3xl font-black mb-2">1º</div>
                  <div className="text-white text-xl font-bold mb-3 truncate">{top3[0].userName}</div>
                  <div className="text-white text-4xl font-black mb-3">{top3[0].finalScore}</div>
                  {top3[0].streak > 0 && (
                    <div className="flex items-center justify-center gap-2 text-white">
                      <FireIcon className="h-5 w-5" />
                      <span className="font-bold">{top3[0].streak} streak</span>
                    </div>
                  )}
                  <div className="mt-3 text-white/90 text-sm">Campeão!</div>
                </div>
              </div>
            </div>
          )}

          {/* 3º Lugar */}
          {top3[2] && (
            <div className="order-3">
              <div className="relative bg-gradient-to-br from-amber-600 to-amber-800 rounded-2xl p-6 shadow-xl transform hover:scale-105 transition-all">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-br from-amber-600 to-amber-800 rounded-full p-3 shadow-lg">
                  <TrophyIcon className="h-8 w-8 text-white" />
                </div>
                <div className="mt-8 text-center">
                  <div className="text-5xl mb-2">🥉</div>
                  <div className="text-white text-2xl font-black mb-2">3º</div>
                  <div className="text-white text-lg font-bold mb-2 truncate">{top3[2].userName}</div>
                  <div className="text-white/90 text-3xl font-black mb-2">{top3[2].finalScore}</div>
                  {top3[2].streak > 0 && (
                    <div className="flex items-center justify-center gap-1 text-white/80">
                      <FireIcon className="h-4 w-4" />
                      <span className="text-sm font-semibold">{top3[2].streak} streak</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resto do Ranking */}
      {rest.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ChartBarIcon className="h-6 w-6 text-alego-600 dark:text-alego-400" />
              Classificação Completa
            </h2>
          </div>
          
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {rest.map((item, index) => {
              const isCurrentUser = item.userId === user?.uid
              return (
                <div
                  key={item.userId}
                  className={`p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                    isCurrentUser ? 'bg-alego-50 dark:bg-alego-900/20 border-l-4 border-alego-600' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* Posição */}
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-black text-lg ${
                        item.position <= 10 
                          ? `bg-gradient-to-br ${getMedalColor(item.position)} text-white`
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}>
                        {item.position}
                      </div>

                      {/* Foto do usuário */}
                      {item.userPhoto ? (
                        <img
                          src={item.userPhoto}
                          alt={item.userName}
                          className="w-12 h-12 rounded-full object-cover border-2 border-slate-300 dark:border-slate-600"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-alego-500 to-alego-600 flex items-center justify-center text-white font-bold text-lg">
                          {item.userName.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Nome e informações */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-slate-800 dark:text-white truncate">
                            {item.userName}
                          </span>
                          {isCurrentUser && (
                            <span className="px-2 py-0.5 bg-alego-600 text-white text-xs font-semibold rounded-full">
                              Você
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 flex-wrap text-sm text-slate-600 dark:text-slate-400">
                          {item.streak > 0 && (
                            <div className="flex items-center gap-1">
                              <FireIcon className="h-4 w-4 text-orange-500" />
                              <span className="font-semibold">{item.streak} streak</span>
                            </div>
                          )}
                          {item.totalSimulados > 0 && (
                            <span>{item.totalSimulados} simulado{item.totalSimulados !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Nota */}
                    <div className="flex items-center gap-6 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-2xl sm:text-3xl font-black text-alego-600 dark:text-alego-400">
                          {item.finalScore}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-500">
                          Melhor nota
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Mensagem se não houver ranking */}
      {rankingData.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-12 text-center">
          <TrophyIcon className="h-16 w-16 text-slate-400 dark:text-slate-600 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-semibold text-slate-600 dark:text-slate-400 mb-2">
            Ainda não há simulados completos
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Faça seu primeiro simulado para aparecer no ranking! 🎯
          </p>
        </div>
      )}
    </div>
  )
}

export default RankingSimulado

