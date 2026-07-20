import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import dayjs from 'dayjs'
import {
  ArrowLeftIcon,
  ClockIcon,
  BookOpenIcon,
  DocumentTextIcon,
  PencilIcon,
  FireIcon,
  SparklesIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

const GuiaMentoradoDiaView = () => {
  const { courseId, date } = useParams()
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  
  const [dayData, setDayData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [schedule, setSchedule] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newActivity, setNewActivity] = useState({
    startTime: '',
    endTime: '',
    activity: '',
    completed: false,
  })
  
  useEffect(() => {
    loadDayData()
  }, [courseId, date])
  
  const loadDayData = async () => {
    try {
      setLoading(true)
      const monthKey = dayjs(date).format('YYYY-MM')
      const cronogramaRef = doc(db, 'courses', courseId, 'cronograma', monthKey)
      const cronogramaDoc = await getDoc(cronogramaRef)
      
      if (cronogramaDoc.exists()) {
        const cronogramaData = cronogramaDoc.data()
        const dayKey = date
        setDayData(cronogramaData.days[dayKey] || null)
        
        // Carregar schedule personalizado do usuário se existir
        const userScheduleRef = doc(db, 'courses', courseId, 'cronograma', monthKey, 'userSchedules', user.uid)
        const userScheduleDoc = await getDoc(userScheduleRef)
        
        if (userScheduleDoc.exists()) {
          const userData = userScheduleDoc.data()
          setSchedule(userData.days[dayKey] || [])
        } else {
          // Gerar schedule automático baseado nas matérias
          generateAutoSchedule(cronogramaData.days[dayKey])
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados do dia:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const generateAutoSchedule = (dayInfo) => {
    if (!dayInfo) return
    
    const autoSchedule = []
    const dayType = dayInfo.type
    const materias = dayInfo.materias || []
    const tafExercicio = dayInfo.tafExercicio
    
    // Distribuição padrão de horas
    let currentTime = 6 // Começa às 6h
    
    if (dayType === 'taf' && tafExercicio) {
      // TAF pela manhã (6h-8h)
      autoSchedule.push({
        startTime: '06:00',
        endTime: '08:00',
        activity: `TAF: ${tafExercicio}`,
        type: 'taf',
        completed: false,
      })
      currentTime = 8
    }
    
    if (dayType === 'estudo' || dayType === 'taf' || dayType === 'revisao') {
      // Distribuir matérias ao longo do dia
      const hoursPerMateria = Math.max(2, Math.floor((18 - currentTime) / Math.max(materias.length, 1)))
      
      materias.forEach((materia, idx) => {
        autoSchedule.push({
          startTime: `${String(currentTime).padStart(2, '0')}:00`,
          endTime: `${String(currentTime + hoursPerMateria).padStart(2, '0')}:00`,
          activity: `${materia.disciplina}: ${materia.topico}`,
          type: 'estudo',
          completed: false,
        })
        currentTime += hoursPerMateria
        
        // Pausa de 1h entre matérias
        if (idx < materias.length - 1 && currentTime < 18) {
          autoSchedule.push({
            startTime: `${String(currentTime).padStart(2, '0')}:00`,
            endTime: `${String(currentTime + 1).padStart(2, '0')}:00`,
            activity: 'Pausa / Almoço',
            type: 'pausa',
            completed: false,
          })
          currentTime += 1
        }
      })
    }
    
    if (dayType === 'redacao') {
      autoSchedule.push({
        startTime: '08:00',
        endTime: '12:00',
        activity: 'Prática de Redação',
        type: 'redacao',
        completed: false,
      })
      autoSchedule.push({
        startTime: '14:00',
        endTime: '18:00',
        activity: 'Revisão e Correção da Redação',
        type: 'revisao',
        completed: false,
      })
    }

    if (dayType === 'incidencia' || dayType === 'reta_final') {
      const materiasInc = dayInfo.materias || []
      let t = 8
      if (!materiasInc.length) {
        autoSchedule.push({
          startTime: '08:00',
          endTime: '12:00',
          activity: 'Revisão por incidência (todas as matérias)',
          type: 'incidencia',
          completed: false,
        })
      } else {
        materiasInc.forEach((materia) => {
          const nome = materia?.disciplina || materia?.materia || 'Matéria'
          autoSchedule.push({
            startTime: `${String(t).padStart(2, '0')}:00`,
            endTime: `${String(Math.min(t + 2, 20)).padStart(2, '0')}:00`,
            activity: `Incidência: ${nome}`,
            type: 'incidencia',
            completed: false,
          })
          t = Math.min(t + 2, 18)
        })
      }
    }

    if (dayType === 'simulado') {
      autoSchedule.push({
        startTime: '08:00',
        endTime: '12:00',
        activity: 'Simulado Completo',
        type: 'simulado',
        completed: false,
      })
      autoSchedule.push({
        startTime: '14:00',
        endTime: '18:00',
        activity: 'Correção e Análise do Simulado',
        type: 'revisao',
        completed: false,
      })
    }
    
    if (dayType === 'reta_final') {
      autoSchedule.push({
        startTime: '08:00',
        endTime: '12:00',
        activity: 'Revisão Geral',
        type: 'revisao',
        completed: false,
      })
      autoSchedule.push({
        startTime: '14:00',
        endTime: '18:00',
        activity: 'Simulado Rápido',
        type: 'simulado',
        completed: false,
      })
    }
    
    setSchedule(autoSchedule)
  }
  
  const saveSchedule = async () => {
    try {
      const monthKey = dayjs(date).format('YYYY-MM')
      const dayKey = date
      const userScheduleRef = doc(db, 'courses', courseId, 'cronograma', monthKey, 'userSchedules', user.uid)
      
      await updateDoc(userScheduleRef, {
        [`days.${dayKey}`]: schedule,
        updatedAt: new Date(),
      })
      
      alert('Cronograma do dia salvo com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar cronograma:', error)
      alert('Erro ao salvar cronograma.')
    }
  }
  
  const addActivity = () => {
    if (!newActivity.startTime || !newActivity.endTime || !newActivity.activity) {
      alert('Preencha todos os campos')
      return
    }
    
    setSchedule([...schedule, { ...newActivity, completed: false }])
    setNewActivity({ startTime: '', endTime: '', activity: '', completed: false })
    setShowAddModal(false)
  }
  
  const removeActivity = (index) => {
    setSchedule(schedule.filter((_, i) => i !== index))
  }
  
  const toggleActivityComplete = (index) => {
    const updated = [...schedule]
    updated[index].completed = !updated[index].completed
    setSchedule(updated)
  }
  
  const getActivityIcon = (type) => {
    switch (type) {
      case 'taf':
        return <DocumentTextIcon className="h-4 w-4 text-orange-400" />
      case 'estudo':
        return <BookOpenIcon className="h-4 w-4 text-blue-400" />
      case 'redacao':
        return <PencilIcon className="h-4 w-4 text-pink-400" />
      case 'simulado':
        return <FireIcon className="h-4 w-4 text-purple-400" />
      case 'revisao':
        return <SparklesIcon className="h-4 w-4 text-green-400" />
      default:
        return <ClockIcon className="h-4 w-4 text-gray-400" />
    }
  }
  
  const getActivityColor = (type) => {
    switch (type) {
      case 'taf':
        return 'bg-orange-500/10 border-orange-500/30'
      case 'estudo':
        return 'bg-blue-500/10 border-blue-500/30'
      case 'redacao':
        return 'bg-pink-500/10 border-pink-500/30'
      case 'simulado':
        return 'bg-purple-500/10 border-purple-500/30'
      case 'revisao':
        return 'bg-green-500/10 border-green-500/30'
      case 'pausa':
        return 'bg-gray-500/10 border-gray-500/30'
      default:
        return 'bg-gray-500/10 border-gray-500/30'
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="text-text-primary">Carregando...</div>
      </div>
    )
  }
  
  const formattedDate = dayjs(date).format('DD [de] MMMM [de] YYYY')
  const dayOfWeek = dayjs(date).format('dddd')
  
  return (
    <div className="min-h-screen bg-background-primary p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary mb-4 transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar
          </button>
          
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
            {dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)}, {formattedDate}
          </h1>
          
          {dayData && (
            <div className="mt-2 flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                dayData.type === 'estudo'
                  ? 'bg-blue-500/20 text-blue-300'
                  : dayData.type === 'taf'
                  ? 'bg-orange-500/20 text-orange-300'
                  : dayData.type === 'redacao'
                  ? 'bg-pink-500/20 text-pink-300'
                  : dayData.type === 'revisao'
                  ? 'bg-green-500/20 text-green-300'
                  : dayData.type === 'simulado'
                  ? 'bg-purple-500/20 text-purple-300'
                  : dayData.type === 'reta_final'
                  ? 'bg-red-500/20 text-red-300'
                  : 'bg-gray-500/20 text-gray-300'
              }`}>
                {dayData.type.charAt(0).toUpperCase() + dayData.type.slice(1)}
              </span>
              {dayData.fase && (
                <span className="text-text-secondary text-sm">
                  Fase: {dayData.fase}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Informações do Dia */}
        {dayData && (
          <div className="mb-6 p-4 rounded-xl bg-background-card border border-border-primary">
            <h2 className="text-lg font-semibold text-text-primary mb-3">Matérias do Dia</h2>
            {dayData.materias && dayData.materias.length > 0 ? (
              <div className="space-y-2">
                {dayData.materias.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-text-secondary">
                    <BookOpenIcon className="h-4 w-4 text-blue-400" />
                    <span className="font-medium text-text-primary">{m.disciplina}:</span>
                    <span>{m.topico}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-text-secondary">Nenhuma matéria específica para este dia</p>
            )}
            {dayData.tafExercicio && (
              <div className="mt-3 flex items-center gap-2 text-text-secondary">
                <DocumentTextIcon className="h-4 w-4 text-orange-400" />
                <span className="font-medium text-text-primary">TAF:</span>
                <span>{dayData.tafExercicio}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Timeline de Horas */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Cronograma do Dia</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-accent-cyan text-background-primary rounded-lg hover:bg-accent-cyan-dim transition-colors text-sm"
            >
              <PlusIcon className="h-4 w-4" />
              Adicionar
            </button>
          </div>
          
          <div className="space-y-3">
            {schedule.map((activity, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border ${getActivityColor(activity.type)} ${
                  activity.completed ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="flex items-center gap-2 text-text-primary">
                      <ClockIcon className="h-4 w-4" />
                      <span className="font-semibold">
                        {activity.startTime} - {activity.endTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {getActivityIcon(activity.type)}
                      <span className="text-text-secondary">{activity.activity}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleActivityComplete(idx)}
                      className={`p-2 rounded-lg transition-colors ${
                        activity.completed
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/10 text-gray-400 hover:bg-gray-500/20'
                      }`}
                    >
                      <CheckIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeActivity(idx)}
                      className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {schedule.length === 0 && (
              <div className="p-8 rounded-xl bg-background-card border border-border-primary text-center">
                <ClockIcon className="h-12 w-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-secondary">Nenhuma atividade agendada</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 text-accent-cyan hover:text-accent-cyan-dim"
                >
                  Adicionar primeira atividade
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Botão Salvar */}
        <button
          onClick={saveSchedule}
          className="w-full py-3 bg-gradient-to-r from-accent-orange to-accent-cyan text-background-primary rounded-xl font-semibold hover:from-accent-orange-dim hover:to-accent-cyan-dim transition-all"
        >
          Salvar Cronograma do Dia
        </button>
        
        {/* Modal Adicionar Atividade */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-background-card rounded-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-text-primary mb-4">Adicionar Atividade</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Horário Início
                  </label>
                  <input
                    type="time"
                    value={newActivity.startTime}
                    onChange={(e) => setNewActivity({ ...newActivity, startTime: e.target.value })}
                    className="w-full rounded-lg border border-border-primary bg-background-primary px-4 py-2 text-text-primary focus:border-accent-cyan focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Horário Fim
                  </label>
                  <input
                    type="time"
                    value={newActivity.endTime}
                    onChange={(e) => setNewActivity({ ...newActivity, endTime: e.target.value })}
                    className="w-full rounded-lg border border-border-primary bg-background-primary px-4 py-2 text-text-primary focus:border-accent-cyan focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Atividade
                  </label>
                  <input
                    type="text"
                    value={newActivity.activity}
                    onChange={(e) => setNewActivity({ ...newActivity, activity: e.target.value })}
                    placeholder="Ex: Estudar Direito Constitucional"
                    className="w-full rounded-lg border border-border-primary bg-background-primary px-4 py-2 text-text-primary focus:border-accent-cyan focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Tipo
                  </label>
                  <select
                    value={newActivity.type || 'estudo'}
                    onChange={(e) => setNewActivity({ ...newActivity, type: e.target.value })}
                    className="w-full rounded-lg border border-border-primary bg-background-primary px-4 py-2 text-text-primary focus:border-accent-cyan focus:outline-none"
                  >
                    <option value="estudo">Estudo</option>
                    <option value="revisao">Revisão</option>
                    <option value="taf">TAF</option>
                    <option value="redacao">Redação</option>
                    <option value="simulado">Simulado</option>
                    <option value="pausa">Pausa</option>
                  </select>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 border border-border-primary text-text-primary rounded-lg hover:bg-background-primary transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={addActivity}
                  className="flex-1 py-2 bg-accent-cyan text-background-primary rounded-lg hover:bg-accent-cyan-dim transition-colors"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GuiaMentoradoDiaView
