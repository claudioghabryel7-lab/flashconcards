import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { TrophyIcon, FireIcon, ClockIcon, ChartBarIcon, BoltIcon, StarIcon } from '@heroicons/react/24/solid'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const Ranking = () => {
  const { user, profile, isAdmin } = useAuth()
  const { darkMode } = useDarkMode()
  const [users, setUsers] = useState([])
  const [userProgress, setUserProgress] = useState({}) // { uid: { totalDays, totalHours, studiedCards } }
  const [loading, setLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState(null) // Curso selecionado do perfil
  const [allCards, setAllCards] = useState([]) // Todos os flashcards para filtrar por curso

  // Usar curso selecionado do perfil
  useEffect(() => {
    if (!profile) return
    
    // Usar curso selecionado do perfil (pode ser null para ALEGO padrão)
    const courseFromProfile = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
    setSelectedCourseId(courseFromProfile)
  }, [profile])
  
  // Carregar flashcards para filtrar por curso
  useEffect(() => {
    const cardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(cardsRef, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      setAllCards(data)
    })
    return () => unsub()
  }, [])
  
  // Carregar todos os usuários
  useEffect(() => {
    const usersRef = collection(db, 'users')
    const unsub = onSnapshot(usersRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        uid: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setUsers(data.filter(u => u.role !== 'admin'))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // Carregar progresso de todos os usuários (dias e horas) - filtrado por curso
  useEffect(() => {
    if (selectedCourseId === null && selectedCourseId !== null) return // Aguardar curso ser carregado
    
    const progressRef = collection(db, 'progress')
    const unsub = onSnapshot(progressRef, (snapshot) => {
      const progressData = {}
      const userDates = {} // Para rastrear dias únicos por usuário
      
      // Filtrar por curso selecionado
      const selectedCourse = (selectedCourseId || '').trim()
      
      // Agrupar por uid e calcular totais (apenas do curso selecionado)
      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        const uid = data.uid
        if (!uid) return
        
        // Filtrar por curso
        const itemCourseId = data.courseId
        if (selectedCourse) {
          // Se tem curso selecionado, mostrar apenas progresso desse curso
          if (itemCourseId !== selectedCourse && String(itemCourseId) !== String(selectedCourse)) {
            return // Pular este item
          }
        } else {
          // Se não tem curso selecionado, mostrar apenas progresso sem courseId (ALEGO padrão)
          if (itemCourseId && itemCourseId !== '' && itemCourseId !== null && itemCourseId !== undefined) {
            return // Pular este item
          }
        }
        
        if (!progressData[uid]) {
          progressData[uid] = { totalDays: 0, totalHours: 0, studiedCards: 0 }
          userDates[uid] = new Set()
        }
        
        // Contar dias únicos (cada documento com date único conta como 1 dia)
        const date = data.date
        if (date && !userDates[uid].has(date)) {
          userDates[uid].add(date)
          progressData[uid].totalDays += 1
        }
        
        // Somar todas as horas (mesmo que seja do mesmo dia)
        progressData[uid].totalHours += parseFloat(data.hours || 0)
      })
      
      // Atualizar mantendo os dados de cards estudados
      setUserProgress(prev => {
        const updated = { ...prev }
        Object.keys(progressData).forEach(uid => {
          updated[uid] = {
            totalDays: progressData[uid].totalDays,
            totalHours: progressData[uid].totalHours,
            studiedCards: prev[uid]?.studiedCards || 0
          }
        })
        // Manter dados de usuários que não têm progress ainda mas têm cards
        Object.keys(prev).forEach(uid => {
          if (!updated[uid]) {
            updated[uid] = prev[uid]
          }
        })
        return updated
      })
    })
    return () => unsub()
  }, [selectedCourseId])

  // Carregar progresso de cards estudados (filtrado por curso selecionado)
  useEffect(() => {
    if (!selectedCourseId && selectedCourseId !== null) return // Aguardar curso ser carregado
    
    const userProgressRef = collection(db, 'userProgress')
    const unsub = onSnapshot(userProgressRef, (snapshot) => {
      snapshot.docs.forEach((docSnapshot) => {
        const data = docSnapshot.data()
        const uid = docSnapshot.id
        const cardProgress = data.cardProgress || {}
        
        // Filtrar cards estudados apenas do curso selecionado
        const studiedCards = Object.keys(cardProgress).filter(cardId => {
          const progress = cardProgress[cardId]
          if (!progress || progress.reviewCount === 0) return false
          
          // Encontrar o card nos flashcards carregados
          const card = allCards.find(c => c.id === cardId)
          if (!card) return false
          
          // Filtrar por curso selecionado
          const selectedCourse = (selectedCourseId || '').trim()
          if (selectedCourse) {
            // Se tem curso selecionado, mostrar apenas cards desse curso
            const cardCourseId = card.courseId || null
            return cardCourseId === selectedCourse || String(cardCourseId) === String(selectedCourse)
          } else {
            // Se não tem curso selecionado, mostrar apenas cards sem courseId (ALEGO padrão)
            const cardCourseId = card.courseId
            return !cardCourseId || cardCourseId === '' || cardCourseId === null || cardCourseId === undefined
          }
        }).length
        
        setUserProgress(prev => ({
          ...prev,
          [uid]: {
            totalDays: prev[uid]?.totalDays || 0,
            totalHours: prev[uid]?.totalHours || 0,
            studiedCards: studiedCards,
          }
        }))
      })
    })
    return () => unsub()
  }, [selectedCourseId, allCards])

  // Calcular ranking
  const ranking = useMemo(() => {
    return users
      .map((user) => {
        const progress = userProgress[user.uid] || { totalDays: 0, totalHours: 0, studiedCards: 0 }
        // Pontuação: dias * 10 + horas * 5 + cards estudados * 2
        const score = progress.totalDays * 10 + progress.totalHours * 5 + progress.studiedCards * 2
        
        return {
          ...user,
          progress,
          score,
        }
      })
      .sort((a, b) => b.score - a.score)
      .map((user, index) => ({
        ...user,
        position: index + 1,
      }))
  }, [users, userProgress])

  const userRank = ranking.findIndex((r) => r.uid === user?.uid) + 1
  const currentUserRank = ranking.find((r) => r.uid === user?.uid)

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin text-blue-500 text-4xl mb-4">⚙️</div>
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">Carregando ranking...</p>
        </div>
      </div>
    )
  }

  const top3 = ranking.slice(0, 3)
  const rest = ranking.slice(3)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Tecnológico */}
      <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
        {/* Background gradient decorativo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-amber-500/10 via-yellow-500/10 to-orange-500/10 rounded-full blur-3xl -mr-48 -mt-48"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-tr from-purple-500/10 to-pink-500/10 rounded-full blur-3xl -ml-36 -mb-36"></div>
        
        <div className="relative">
          <div className="flex items-center gap-4 mb-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-2xl blur-lg opacity-50 animate-pulse"></div>
              <div className="relative rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-500 p-4 shadow-lg">
                <TrophyIcon className="h-8 w-8 text-white" />
              </div>
            </div>
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2">
                <span className="bg-gradient-to-r from-amber-600 via-yellow-600 to-orange-600 dark:from-amber-400 dark:via-yellow-400 dark:to-orange-400 bg-clip-text text-transparent">
                  Ranking de Alunos
                </span>
              </h1>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Classificação baseada em dias estudados, horas e cards revisados
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pódio para Top 3 */}
      {top3.length > 0 && (
        <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
          {/* Background decorativo */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-yellow-500/5 to-orange-500/5"></div>
          
          <div className="relative">
            <div className="flex items-center justify-center gap-2 mb-6">
              <BoltIcon className="h-6 w-6 text-amber-500 animate-pulse" />
              <h2 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-amber-600 via-yellow-600 to-orange-600 dark:from-amber-400 dark:via-yellow-400 dark:to-orange-400 bg-clip-text text-transparent">
                Pódio
              </h2>
              <BoltIcon className="h-6 w-6 text-amber-500 animate-pulse" />
            </div>
            
            {/* Pódio Visual */}
            <div className="flex items-end justify-center gap-2 sm:gap-4 mb-8">
              {/* 2º Lugar */}
              {top3[1] && (
                <div className="group relative flex-1 max-w-[200px] animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                  <div className="relative bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700 rounded-t-xl p-4 pb-8 border-2 border-slate-400 dark:border-slate-600 h-32 flex flex-col items-center justify-end">
                    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                      <div className="relative">
                        <div className="absolute inset-0 bg-slate-400 rounded-full blur-md opacity-50 group-hover:opacity-75 transition-opacity"></div>
                        <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center shadow-lg border-4 border-white dark:border-slate-800">
                          <span className="text-2xl">🥈</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs font-black text-white mb-1">2º</p>
                    <p className="text-sm font-bold text-white truncate w-full text-center">{top3[1].displayName || top3[1].email?.split('@')[0]}</p>
                    <p className="text-xs font-bold text-white/90">{top3[1].score} pts</p>
                  </div>
                </div>
              )}
              
              {/* 1º Lugar - MAIOR */}
              {top3[0] && (
                <div className="group relative flex-1 max-w-[220px] animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                  <div className="relative bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-400 rounded-t-xl p-4 pb-12 border-2 border-amber-500 dark:border-amber-400 h-40 flex flex-col items-center justify-end shadow-2xl">
                    {/* Coroa */}
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2">
                      <div className="relative">
                        <div className="absolute inset-0 bg-yellow-500 rounded-full blur-xl opacity-50 animate-pulse"></div>
                        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 via-amber-400 to-orange-400 flex items-center justify-center shadow-2xl border-4 border-white dark:border-slate-800 animate-bounce">
                          <span className="text-3xl">👑</span>
                        </div>
                        <div className="absolute -top-1 -right-1">
                          <StarIcon className="h-4 w-4 text-yellow-300 animate-spin" style={{ animationDuration: '3s' }} />
                        </div>
                      </div>
                    </div>
                    <p className="text-sm font-black text-white mb-1">1º</p>
                    <p className="text-base font-black text-white truncate w-full text-center">{top3[0].displayName || top3[0].email?.split('@')[0]}</p>
                    <p className="text-sm font-black text-white/90">{top3[0].score} pts</p>
                  </div>
                </div>
              )}
              
              {/* 3º Lugar */}
              {top3[2] && (
                <div className="group relative flex-1 max-w-[200px] animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                  <div className="relative bg-gradient-to-br from-amber-700 to-amber-800 dark:from-amber-800 dark:to-amber-900 rounded-t-xl p-4 pb-6 border-2 border-amber-600 dark:border-amber-700 h-28 flex flex-col items-center justify-end">
                    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
                      <div className="relative">
                        <div className="absolute inset-0 bg-amber-600 rounded-full blur-md opacity-50 group-hover:opacity-75 transition-opacity"></div>
                        <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center shadow-lg border-4 border-white dark:border-slate-800">
                          <span className="text-2xl">🥉</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs font-black text-white mb-1">3º</p>
                    <p className="text-sm font-bold text-white truncate w-full text-center">{top3[2].displayName || top3[2].email?.split('@')[0]}</p>
                    <p className="text-xs font-bold text-white/90">{top3[2].score} pts</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Stats do Top 3 */}
            <div className="grid grid-cols-3 gap-4">
              {top3.map((userRank, idx) => (
                <div key={userRank.uid} className="text-center space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <FireIcon className="h-4 w-4 text-orange-500" />
                    <span className="font-bold">{userRank.progress.totalDays} dias</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <ClockIcon className="h-4 w-4 text-blue-500" />
                    <span className="font-bold">{userRank.progress.totalHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <ChartBarIcon className="h-4 w-4 text-emerald-500" />
                    <span className="font-bold">{userRank.progress.studiedCards} cards</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Posição do Usuário Atual - Se não estiver no Top 3 */}
      {currentUserRank && currentUserRank.position > 3 && (
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 via-cyan-500/10 to-purple-500/10 dark:from-blue-500/20 dark:via-cyan-500/20 dark:to-purple-500/20 rounded-2xl border-2 border-blue-500/50 dark:border-blue-400/50 shadow-xl p-6">
          {/* Background animado */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer-slide"></div>
          
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500 rounded-full blur-md opacity-50 animate-pulse"></div>
                <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <span className="text-white font-black text-lg">#{currentUserRank.position}</span>
                </div>
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                Sua Posição
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xl font-black text-slate-900 dark:text-white">
                    {currentUserRank.displayName || currentUserRank.email}
                  </p>
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1">
                    {currentUserRank.score} pontos
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/50 dark:bg-slate-800/50">
                  <FireIcon className="h-4 w-4 text-orange-500" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">{currentUserRank.progress.totalDays} dias</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/50 dark:bg-slate-800/50">
                  <ClockIcon className="h-4 w-4 text-blue-500" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">{currentUserRank.progress.totalHours.toFixed(1)}h</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/50 dark:bg-slate-800/50">
                  <ChartBarIcon className="h-4 w-4 text-emerald-500" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">{currentUserRank.progress.studiedCards} cards</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resto do Ranking (4º em diante) - Design Tecnológico */}
      {rest.length > 0 && (
        <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
          {/* Background decorativo */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-500/5 to-blue-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
          
          <div className="relative">
            <div className="flex items-center gap-3 mb-6">
              <ChartBarIcon className="h-6 w-6 text-purple-500 dark:text-purple-400" />
              <h2 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
                Ranking Completo
              </h2>
            </div>
            
            <div className="space-y-2">
              {rest.map((userRank, index) => {
                const isCurrentUser = userRank.uid === user?.uid
                const showScore = isAdmin || isCurrentUser
                const globalIndex = index + 4 // Continuar numeração a partir do 4º
                
                return (
                  <div
                    key={userRank.uid}
                    className={`group relative flex items-center gap-4 rounded-xl p-4 transition-all ${
                      isCurrentUser 
                        ? 'bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-purple-500/10 dark:from-blue-500/20 dark:via-cyan-500/20 dark:to-purple-500/20 border-2 border-blue-500/50 dark:border-blue-400/50 shadow-lg' 
                        : 'bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 hover:border-purple-500/50 dark:hover:border-purple-400/50 hover:shadow-md'
                    }`}
                  >
                    {/* Background hover */}
                    {!isCurrentUser && (
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"></div>
                    )}
                    
                    {/* Posição */}
                    <div className={`relative flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-black text-white ${
                      isCurrentUser
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg'
                        : 'bg-gradient-to-br from-slate-400 to-slate-500 dark:from-slate-600 dark:to-slate-700'
                    }`}>
                      {isCurrentUser && (
                        <div className="absolute inset-0 bg-blue-500 rounded-xl blur-md opacity-50 animate-pulse"></div>
                      )}
                      <span className="relative text-sm">#{userRank.position}</span>
                    </div>
                    
                    {/* Info do usuário */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm sm:text-base font-bold truncate ${
                          isCurrentUser 
                            ? 'text-blue-700 dark:text-blue-300' 
                            : 'text-slate-900 dark:text-white'
                        }`}>
                          {userRank.displayName || userRank.email}
                        </p>
                        {isCurrentUser && (
                          <span className="px-2 py-0.5 text-xs font-black bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-full">
                            VOCÊ
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                          <FireIcon className="h-3.5 w-3.5 text-orange-500" />
                          <span className="font-semibold">{userRank.progress.totalDays}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                          <ClockIcon className="h-3.5 w-3.5 text-blue-500" />
                          <span className="font-semibold">{userRank.progress.totalHours.toFixed(1)}h</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                          <ChartBarIcon className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="font-semibold">{userRank.progress.studiedCards}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Pontuação */}
                    {showScore && (
                      <div className="flex-shrink-0 text-right">
                        <div className="relative">
                          <div className="absolute inset-0 bg-purple-500/20 rounded-lg blur-md"></div>
                          <div className="relative px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 dark:from-purple-500/20 dark:to-blue-500/20 border border-purple-500/30 dark:border-purple-400/30">
                            <p className="text-lg font-black bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
                              {userRank.score}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                              pts
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mensagem se não houver ranking */}
      {ranking.length === 0 && (
        <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5"></div>
          <div className="relative">
            <TrophyIcon className="h-16 w-16 text-slate-400 dark:text-slate-600 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-semibold text-slate-600 dark:text-slate-400">
              Ainda não há alunos no ranking
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
              Comece a estudar para aparecer aqui e conquistar o primeiro lugar! 🏆
            </p>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export default Ranking

