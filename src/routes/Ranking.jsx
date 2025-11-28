import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore'
import { TrophyIcon, FireIcon, ClockIcon, ChartBarIcon } from '@heroicons/react/24/solid'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const Ranking = () => {
  const { user, profile, isAdmin } = useAuth()
  const { darkMode } = useDarkMode()
  const [users, setUsers] = useState([])
  const [userProgress, setUserProgress] = useState({}) // { uid: { totalDays, totalHours, studiedCards } }
  const [loading, setLoading] = useState(true)

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

  // Carregar progresso de todos os usuários (dias e horas)
  useEffect(() => {
    const progressRef = collection(db, 'progress')
    const unsub = onSnapshot(progressRef, (snapshot) => {
      const progressData = {}
      const userDates = {} // Para rastrear dias únicos por usuário
      
      // Agrupar por uid e calcular totais
      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        const uid = data.uid
        if (!uid) return
        
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
  }, [])

  // Carregar progresso de cards estudados
  useEffect(() => {
    const userProgressRef = collection(db, 'userProgress')
    const unsub = onSnapshot(userProgressRef, (snapshot) => {
      snapshot.docs.forEach((docSnapshot) => {
        const data = docSnapshot.data()
        const uid = docSnapshot.id
        const cardProgress = data.cardProgress || {}
        const studiedCards = Object.keys(cardProgress).filter(
          cardId => cardProgress[cardId].reviewCount > 0
        ).length
        
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
  }, [])

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
        <p className="text-lg font-semibold text-alego-600">Carregando ranking...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-2 sm:px-0">
      <div 
        className="rounded-2xl p-6 sm:p-8 shadow-sm"
        style={{
          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
          color: darkMode ? '#f1f5f9' : '#1e293b'
        }}
      >
        <div className="flex items-center gap-3">
          <TrophyIcon className="h-8 w-8 text-yellow-500" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-alego-700 dark:text-alego-300">
              Ranking de Alunos
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Classificação baseada em dias estudados, horas e cards revisados
            </p>
          </div>
        </div>
      </div>

      {/* Posição do usuário atual */}
      {currentUserRank && (
        <div 
          className="rounded-2xl border-2 border-alego-500 p-6 shadow-sm"
          style={{
            backgroundColor: darkMode ? '#1e293b' : '#ffffff',
            color: darkMode ? '#f1f5f9' : '#1e293b'
          }}
        >
          <p className="text-sm font-semibold text-alego-600 dark:text-alego-400 mb-3">
            Sua Posição
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-alego-600 text-2xl font-bold text-white">
                #{currentUserRank.position}
              </div>
              <div>
                <p className="text-lg font-bold text-alego-700 dark:text-alego-300">
                  {currentUserRank.displayName || currentUserRank.email}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {currentUserRank.score} pontos
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <FireIcon className="h-4 w-4 text-orange-500" />
                  <span>{currentUserRank.progress.totalDays} dias</span>
                </div>
                <div className="flex items-center gap-1">
                  <ClockIcon className="h-4 w-4 text-blue-500" />
                  <span>{currentUserRank.progress.totalHours.toFixed(1)}h</span>
                </div>
                <div className="flex items-center gap-1">
                  <ChartBarIcon className="h-4 w-4 text-emerald-500" />
                  <span>{currentUserRank.progress.studiedCards} cards</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top 10 - Visível para todos */}
      {ranking.length > 0 && (
        <div 
          className="rounded-2xl p-6 shadow-sm"
          style={{
            backgroundColor: darkMode ? '#1e293b' : '#ffffff',
            color: darkMode ? '#f1f5f9' : '#1e293b'
          }}
        >
          <h2 className="text-xl font-bold text-alego-700 dark:text-alego-300 mb-4">
            Top 10 Alunos
          </h2>
          <div className="space-y-3">
            {ranking.slice(0, 10).map((userRank, index) => {
              const isCurrentUser = userRank.uid === user?.uid
              const showScore = isAdmin || isCurrentUser // Admin vê todas as pontuações, aluno vê apenas a própria
              const medalColors = [
                'bg-yellow-500', // 1º lugar
                'bg-slate-400',  // 2º lugar
                'bg-amber-600',  // 3º lugar
              ]
              
              return (
                <div
                  key={userRank.uid}
                  className={`flex items-center gap-4 rounded-xl p-4 ${
                    isCurrentUser 
                      ? 'bg-alego-50 dark:bg-alego-900 border-2 border-alego-500' 
                      : 'bg-slate-50 dark:bg-slate-800'
                  }`}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white ${
                    index < 3 ? medalColors[index] : 'bg-alego-600'
                  }`}>
                    {index < 3 ? '🏆' : `#${userRank.position}`}
                  </div>
                  <div className="flex-1">
                    <p className={`font-semibold ${
                      isCurrentUser 
                        ? 'text-alego-700 dark:text-alego-300' 
                        : 'text-slate-700 dark:text-slate-300'
                    }`}>
                      {userRank.displayName || userRank.email}
                      {isCurrentUser && ' (Você)'}
                    </p>
                    <div className="mt-1 flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{userRank.progress.totalDays} dias</span>
                      <span>{userRank.progress.totalHours.toFixed(1)}h</span>
                      <span>{userRank.progress.studiedCards} cards</span>
                    </div>
                  </div>
                  {showScore && (
                    <div className="text-right">
                      <p className="text-lg font-bold text-alego-600 dark:text-alego-400">
                        {userRank.score}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">pontos</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ranking completo - Visível para todos */}
      {ranking.length > 10 && (
        <div 
          className="rounded-2xl p-6 shadow-sm"
          style={{
            backgroundColor: darkMode ? '#1e293b' : '#ffffff',
            color: darkMode ? '#f1f5f9' : '#1e293b'
          }}
        >
          <h2 className="text-xl font-bold text-alego-700 dark:text-alego-300 mb-4">
            Ranking Completo
          </h2>
          <div className="space-y-2">
            {ranking.map((userRank) => {
              const isCurrentUser = userRank.uid === user?.uid
              const showScore = isAdmin || isCurrentUser // Admin vê todas as pontuações, aluno vê apenas a própria
              
              return (
                <div
                  key={userRank.uid}
                  className={`flex items-center gap-3 rounded-lg p-3 ${
                    isCurrentUser 
                      ? 'bg-alego-50 dark:bg-alego-900 border border-alego-500' 
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="w-8 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    #{userRank.position}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${
                      isCurrentUser 
                        ? 'text-alego-700 dark:text-alego-300' 
                        : 'text-slate-700 dark:text-slate-300'
                    }`}>
                      {userRank.displayName || userRank.email}
                      {isCurrentUser && ' (Você)'}
                    </p>
                    <div className="mt-1 flex gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{userRank.progress.totalDays} dias</span>
                      <span>{userRank.progress.totalHours.toFixed(1)}h</span>
                      <span>{userRank.progress.studiedCards} cards</span>
                    </div>
                  </div>
                  {showScore && (
                    <span className="text-sm font-bold text-alego-600 dark:text-alego-400">
                      {userRank.score} pts
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Mensagem se não houver ranking */}
      {ranking.length === 0 && (
        <div 
          className="rounded-2xl p-6 shadow-sm text-center"
          style={{
            backgroundColor: darkMode ? '#1e293b' : '#ffffff',
            color: darkMode ? '#f1f5f9' : '#1e293b'
          }}
        >
          <p className="text-slate-500 dark:text-slate-400">
            Ainda não há alunos no ranking. Comece a estudar para aparecer aqui!
          </p>
        </div>
      )}
    </div>
  )
}

export default Ranking

