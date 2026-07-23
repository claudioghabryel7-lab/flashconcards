import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
import { useMemo } from 'react'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { CalendarIcon, FireIcon } from '@heroicons/react/24/outline'

// Configurar locale para português
dayjs.locale('pt-br')

const ProgressCalendar = ({ dates = [], streak = 0, bySubject = {}, onMarkDay = null }) => {
  const { darkMode } = useDarkMode()
  
  // Normalizar datas para formato YYYY-MM-DD para comparação
  const studied = useMemo(() => {
    const normalized = dates.map(date => {
      if (!date) return null
      // Se já está no formato YYYY-MM-DD, retorna direto
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date
      }
      // Caso contrário, tenta parsear com dayjs
      const parsed = dayjs(date)
      if (parsed.isValid()) {
        return parsed.format('YYYY-MM-DD')
      }
      return null
    }).filter(Boolean)
    
    const studiedSet = new Set(normalized)
    return studiedSet
  }, [dates])
  
  // Criar calendário com últimos 28 dias incluindo hoje
  const today = dayjs().startOf('day')
  const daysToShow = 28
  
  // Último dia (hoje) - sempre atualizar para hoje
  const lastDay = today.clone()
  
  // Primeiro dia a mostrar (27 dias atrás, já que hoje conta)
  const firstDay = today.clone().subtract(daysToShow - 1, 'day')
  
  // Calcular dias estudados no período (únicos dentro do range de 28 dias)
  const studiedInRange = Array.from(studied).filter(dateStr => {
    const date = dayjs(dateStr)
    if (!date.isValid()) return false
    return (date.isSame(firstDay, 'day') || date.isAfter(firstDay, 'day')) && 
           (date.isSame(lastDay, 'day') || date.isBefore(lastDay, 'day'))
  })
  
  const studiedCount = studiedInRange.length
  const daysRemaining = Math.max(0, daysToShow - studiedCount)
  const activityRate = Math.round((studiedCount / daysToShow) * 100)
  
  // Encontrar a segunda-feira da semana que contém o primeiro dia para alinhar visualmente
  const firstDayWeekday = firstDay.day() // 0=domingo, 1=segunda, ..., 6=sábado
  const daysToMonday = firstDayWeekday === 0 ? 6 : firstDayWeekday - 1
  const weekStart = firstDay.clone().subtract(daysToMonday, 'day')
  
  // Encontrar o domingo da semana que contém hoje
  const lastDayWeekday = lastDay.day()
  const daysToSunday = lastDayWeekday === 0 ? 0 : 7 - lastDayWeekday
  const weekEnd = lastDay.clone().add(daysToSunday, 'day')
  
  // Calcular quantos dias tem da segunda da primeira semana até o domingo da última semana
  const totalDays = weekEnd.diff(weekStart, 'day') + 1
  
  // Criar grid começando da segunda-feira da primeira semana até o domingo da última semana
  // Isso garante que sempre mostra semanas completas visualmente
  const calendarDays = Array.from({ length: totalDays }, (_, index) =>
    weekStart.clone().add(index, 'day').startOf('day')
  )

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-3 sm:p-4 md:p-6">
      {/* Header do Calendário */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <CalendarIcon className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Progresso
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {today.format('MMM/YYYY').replace(/^\w/, (c) => c.toUpperCase())} · 28 dias
            </p>
          </div>
        </div>
        <div className="text-center sm:text-right">
          <div className="flex items-center justify-center sm:justify-end gap-1 sm:gap-2">
            <FireIcon className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
            <div>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Seq.
              </p>
              <p className="text-lg sm:text-2xl font-black text-amber-500">{streak}d</p>
            </div>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="mb-3 sm:mb-4 flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3 text-[10px] sm:text-xs">
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded bg-slate-200 dark:bg-slate-700"></div>
          <span className="text-slate-500 dark:text-slate-400 hidden xs:inline">Sem estudo</span>
          <span className="text-slate-500 dark:text-slate-400 xs:hidden">Não</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded bg-green-500 dark:bg-green-500"></div>
          <span className="text-slate-500 dark:text-slate-400 hidden xs:inline">Estudou</span>
          <span className="text-slate-500 dark:text-slate-400 xs:hidden">Sim</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded bg-green-600 dark:bg-green-600 ring-1 sm:ring-2 ring-green-400"></div>
          <span className="text-slate-500 dark:text-slate-400 hidden xs:inline">Hoje (estudou)</span>
          <span className="text-slate-500 dark:text-slate-400 xs:hidden">Hoje+</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded bg-blue-200 dark:bg-blue-800 border border-blue-400"></div>
          <span className="text-slate-500 dark:text-slate-400 hidden xs:inline">Hoje (sem estudo)</span>
          <span className="text-slate-500 dark:text-slate-400 xs:hidden">Hoje-</span>
        </div>
      </div>

      {/* Calendário Grid */}
      <div className="space-y-1 sm:space-y-2">
        {/* Labels dos dias da semana */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1 sm:mb-2">
          {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, index) => (
            <div
              key={index}
              className="text-center text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400"
            >
              <span className="hidden sm:inline">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][index]}</span>
              <span className="sm:hidden">{day}</span>
            </div>
          ))}
        </div>

        {/* Grid de dias */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-2">
          {calendarDays.map((day) => {
            const key = day.format('YYYY-MM-DD')
            const done = studied.has(key)
            const isToday = day.isSame(today, 'day')
            const isFuture = day.isAfter(today, 'day')
            const isInRange = (day.isSame(firstDay, 'day') || day.isAfter(firstDay, 'day')) && 
                              (day.isSame(lastDay, 'day') || day.isBefore(lastDay, 'day'))
            
            // 🔥 DEBUG: Log para hoje
            if (isToday) {
              console.log('📅 Hoje no calendário:', {
                key,
                done,
                isInRange,
                bySubjectKey: bySubject[key],
                materia: bySubject[key]?.materia
              })
            }
            
            // Determinar cor baseado no estado
            let bgColor = 'bg-slate-200 dark:bg-slate-700'
            let borderColor = ''
            let showCheck = false
            let showTodayIndicator = false
            
            if (isInRange || isToday) {
              if (done) {
                bgColor = isToday 
                  ? 'bg-green-600 dark:bg-green-600' 
                  : 'bg-green-500 dark:bg-green-500'
                borderColor = isToday ? 'ring-2 ring-green-400 dark:ring-green-400' : ''
                showCheck = true
                showTodayIndicator = isToday
              } else {
                bgColor = isToday 
                  ? 'bg-blue-200 dark:bg-blue-800 border-2 border-blue-400 dark:border-blue-500' 
                  : 'bg-slate-200 dark:bg-slate-700'
                showTodayIndicator = isToday
              }
            } else if (isFuture) {
              bgColor = 'bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 opacity-50'
            } else {
              bgColor = 'bg-slate-100 dark:bg-slate-800 opacity-30'
            }

            // Permitir marcar dia se estiver no range (incluindo hoje) e não for futuro
            const canMark = onMarkDay && (isInRange || isToday) && !isFuture
            const handleClick = () => {
              if (canMark) {
                onMarkDay(key)
              }
            }

            return (
              <div
                key={key}
                onClick={handleClick}
                className={`group relative aspect-square rounded-sm sm:rounded-md ${bgColor} ${borderColor} transition-all duration-200 ${
                  canMark ? 'cursor-pointer hover:scale-105 hover:shadow-md' : ''
                } ${!isInRange && !isFuture && !isToday ? 'opacity-30' : ''}`}
                title={`${day.format('DD/MM/YYYY')}${isInRange || isToday ? (done ? ' - Estudou (clique para desmarcar)' : ' - Sem estudo (clique para marcar)') : ''}`}
              >
                {/* Número do dia - sempre mostrar */}
                <div className={`absolute top-0.5 left-0.5 sm:top-1 sm:left-1 text-[8px] sm:text-[9px] md:text-[10px] font-semibold ${
                  done && (isInRange || isToday) ? 'text-white/70' : 
                  (isInRange || isToday) ? 'text-slate-600 dark:text-slate-400' :
                  'text-slate-400 dark:text-slate-600'
                }`}>
                  {day.format('D')}
                </div>
                
                {/* Matérias estudadas — mostra X, Y… (não só a última) */}
                {done && (isInRange || isToday) && (() => {
                  const dayKey = day.format('YYYY-MM-DD')
                  const dayInfo = bySubject[dayKey]
                  const labels = Array.isArray(dayInfo?.materias) && dayInfo.materias.length
                    ? dayInfo.materias
                    : dayInfo?.materia
                      ? [dayInfo.materia]
                      : []
                  if (!labels.length) return null
                  const title = labels.join(', ')
                  const short =
                    labels.length === 1
                      ? labels[0].length > 10
                        ? `${labels[0].substring(0, 10)}…`
                        : labels[0]
                      : `${labels[0].substring(0, 6)}… +${labels.length - 1}`
                  return (
                    <div
                      className="absolute left-1 right-1 top-4 hidden truncate rounded bg-black/20 px-0.5 text-[6px] font-medium leading-tight text-white/90 sm:top-5 sm:block sm:text-[7px] md:text-[8px]"
                      title={title}
                    >
                      {short}
                    </div>
                  )
                })()}
                
                {/* Checkmark quando estudou */}
                {showCheck && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
                
                {/* Indicador de hoje */}
                {showTodayIndicator && (
                  <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 dark:bg-blue-400 rounded-full ring-1 sm:ring-2 ring-white dark:ring-slate-800"></div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Estatísticas */}
      <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-black text-green-600 dark:text-green-400">{studiedCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Dias estudados</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
              {activityRate}%
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Taxa de atividade</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-black text-amber-500">{streak}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sequência atual</p>
          </div>
        </div>
        
        {/* Progresso por Matéria */}
        {bySubject && Object.keys(bySubject).length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Progresso por Matéria</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(bySubject).map(([materia, stats]) => {
                const percentage = stats?.percentage || 0
                const studiedCards = stats?.studiedCards || 0
                const totalCards = stats?.totalCards || 0
                
                if (totalCards === 0) return null
                
                return (
                  <div key={materia} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 truncate" title={materia}>
                      {materia}
                    </p>
                    <p className="text-lg font-black text-blue-600 dark:text-blue-400 mb-1">{percentage}%</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-500">
                      {studiedCards}/{totalCards} cards
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProgressCalendar
