import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
import { useMemo } from 'react'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { CalendarIcon, FireIcon } from '@heroicons/react/24/outline'

// Configurar locale para português
dayjs.locale('pt-br')

const ProgressCalendar = ({ dates = [], streak = 0, bySubject = {} }) => {
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
    console.log('📅 Calendário - Datas estudadas:', { 
      total: studiedSet.size, 
      dates: Array.from(studiedSet).slice(-5),
      today: dayjs().format('YYYY-MM-DD'),
      hasToday: studiedSet.has(dayjs().format('YYYY-MM-DD'))
    })
    
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
  
  console.log('📅 Calendário (Janela Deslizante de 28 dias):', {
    hoje: today.format('DD/MM/YYYY'),
    hojeNumero: today.format('D'),
    primeiroDiaRange: firstDay.format('DD/MM/YYYY'),
    ultimoDiaRange: lastDay.format('DD/MM/YYYY'),
    primeiroDiaGrid: calendarDays[0]?.format('DD/MM/YYYY'),
    ultimoDiaGrid: calendarDays[calendarDays.length - 1]?.format('DD/MM/YYYY'),
    hojeNoGrid: calendarDays.find(d => d.isSame(today, 'day'))?.format('DD/MM/YYYY'),
    totalDiasGrid: calendarDays.length,
    comportamento: 'Janela deslizante: dias antigos saem, novo dia (hoje) entra, sempre 28 dias no range'
  })

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
      {/* Header do Calendário */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Calendário de Progresso
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {today.format('MMMM [de] YYYY').replace(/^\w/, (c) => c.toUpperCase())} • Últimos 28 dias
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2">
            <FireIcon className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Sequência
              </p>
              <p className="text-2xl font-black text-amber-500">{streak} dias</p>
            </div>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3 sm:gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-slate-200 dark:bg-slate-700"></div>
          <span className="text-slate-500 dark:text-slate-400">Sem estudo</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-green-500 dark:bg-green-500"></div>
          <span className="text-slate-500 dark:text-slate-400">Estudou</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-green-600 dark:bg-green-600 ring-2 ring-green-400"></div>
          <span className="text-slate-500 dark:text-slate-400">Hoje (estudou)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-blue-200 dark:bg-blue-800 border-2 border-blue-400"></div>
          <span className="text-slate-500 dark:text-slate-400">Hoje (sem estudo)</span>
        </div>
      </div>

      {/* Calendário Grid */}
      <div className="space-y-2">
        {/* Labels dos dias da semana */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
            <div
              key={day}
              className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Grid de dias */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {calendarDays.map((day) => {
            const key = day.format('YYYY-MM-DD')
            const done = studied.has(key)
            const isToday = day.isSame(today, 'day')
            const isFuture = day.isAfter(today, 'day')
            const isInRange = (day.isSame(firstDay, 'day') || day.isAfter(firstDay, 'day')) && 
                              (day.isSame(lastDay, 'day') || day.isBefore(lastDay, 'day'))
            
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

            return (
              <div
                key={key}
                className={`group relative aspect-square rounded-md ${bgColor} ${borderColor} transition-all duration-200 ${
                  done && isInRange && !isToday ? 'hover:scale-105 cursor-pointer' : ''
                } ${!isInRange && !isFuture && !isToday ? 'opacity-30' : ''}`}
                title={`${day.format('DD/MM/YYYY')}${isInRange || isToday ? (done ? ' - Estudou' : ' - Sem estudo') : ''}`}
              >
                {/* Número do dia - sempre mostrar */}
                <div className={`absolute top-1 left-1 text-[9px] sm:text-[10px] font-semibold ${
                  done && (isInRange || isToday) ? 'text-white/70' : 
                  (isInRange || isToday) ? 'text-slate-600 dark:text-slate-400' :
                  'text-slate-400 dark:text-slate-600'
                }`}>
                  {day.format('D')}
                </div>
                
                {/* Checkmark quando estudou */}
                {showCheck && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="w-3 h-3 sm:w-4 sm:h-4 text-white"
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
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full ring-2 ring-white dark:ring-slate-800"></div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Estatísticas */}
      <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-black text-green-600 dark:text-green-400">{studiedCount}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Dias estudados</p>
          </div>
          <div className="text-center">
            <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{daysRemaining}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Dias restantes</p>
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
