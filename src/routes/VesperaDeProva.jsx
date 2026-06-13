import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import {
  SparklesIcon,
  CheckIcon,
  ShareIcon,
  DocumentArrowDownIcon,
  MoonIcon,
  SunIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FireIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  BookOpenIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline'

const VesperaDeProva = () => {
  const { user, profile, isAdmin } = useAuth()
  const { darkMode, toggleDarkMode } = useDarkMode()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  
  const [courseId, setCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [loading, setLoading] = useState(true)
  const [generatedMaterial, setGeneratedMaterial] = useState(null)
  const [shareToken, setShareToken] = useState(null)
  const [shareExpiry, setShareExpiry] = useState(null)
  
  // Progresso do aluno
  const [progresso, setProgresso] = useState({})
  const [materiaExpandida, setMateriaExpandida] = useState(null)
  
  // Carregar courseId
  useEffect(() => {
    const courseFromUrl = searchParams.get('course')
    const courseFromProfile = profile?.selectedCourseId
    const finalCourseId = courseFromUrl || courseFromProfile || 'alego-default'
    setCourseId(finalCourseId)
  }, [searchParams, profile])
  
  // Carregar nome do curso e edital verticalizado
  useEffect(() => {
    if (!courseId) return
    
    const loadCourseData = async () => {
      try {
        setLoading(true)
        
        // Carregar nome do curso
        const courseDoc = await getDoc(doc(db, 'courses', courseId))
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || '')
        }
        
        // Verificar se há material gerado
        const materialRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'material')
        const materialSnapshot = await getDoc(materialRef)
        
        if (materialSnapshot.exists()) {
          const materialData = materialSnapshot.data()
          setGeneratedMaterial(materialData)
          
          // Carregar progresso do usuário
          if (user) {
            const progressRef = doc(db, 'userVesperaProgress', user.uid, 'courses', courseId)
            const progressSnapshot = await getDoc(progressRef)
            if (progressSnapshot.exists()) {
              setProgresso(progressSnapshot.data().progress || {})
            }
          }
        }
        
        // Verificar se é link compartilhado
        const sharedToken = searchParams.get('token')
        if (sharedToken) {
          await loadSharedMaterial(sharedToken)
        }
        
      } catch (error) {
        console.error('Erro ao carregar dados:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadCourseData()
  }, [courseId, user, searchParams])
  
  // Carregar material compartilhado
  const loadSharedMaterial = async (token) => {
    try {
      const shareRef = doc(db, 'vesperaShares', token)
      const shareSnapshot = await getDoc(shareRef)
      
      if (shareSnapshot.exists()) {
        const shareData = shareSnapshot.data()
        
        // Verificar se ainda é válido
        if (shareData.expiresAt && shareData.expiresAt.toDate() > new Date()) {
          const materialRef = doc(db, 'courses', shareData.courseId, 'vesperaDeProva', 'material')
          const materialSnapshot = await getDoc(materialRef)
          
          if (materialSnapshot.exists()) {
            setGeneratedMaterial(materialSnapshot.data())
            setCourseId(shareData.courseId)
          }
        } else {
          alert('Este link de compartilhamento expirou.')
          navigate('/dashboard')
        }
      }
    } catch (error) {
      console.error('Erro ao carregar material compartilhado:', error)
    }
  }
  
  // Gerar link de compartilhamento
  const generateShareLink = async () => {
    if (!isAdmin) {
      alert('Apenas administradores podem gerar links de compartilhamento.')
      return
    }
    
    try {
      const token = Math.random().toString(36).substring(2, 15)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora
      
      await setDoc(doc(db, 'vesperaShares', token), {
        courseId: courseId,
        generatedBy: user.uid,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
      })
      
      const shareUrl = `${window.location.origin}/vespera-de-prova?token=${token}`
      
      // Copiar para clipboard
      await navigator.clipboard.writeText(shareUrl)
      
      setShareToken(token)
      setShareExpiry(expiresAt)
      alert('Link copiado para a área de transferência! Válido por 1 hora.')
      
      // Mostrar countdown
      const countdown = setInterval(() => {
        const now = new Date()
        if (now >= expiresAt) {
          clearInterval(countdown)
          setShareToken(null)
          setShareExpiry(null)
        }
      }, 1000)
      
    } catch (error) {
      console.error('Erro ao gerar link:', error)
      alert('Erro ao gerar link de compartilhamento.')
    }
  }
  
  // Marcar matéria como lida
  const toggleMateriaLida = async (disciplinaIdx) => {
    if (!user) return
    
    try {
      const newProgresso = {
        ...progresso,
        [disciplinaIdx]: !progresso[disciplinaIdx]
      }
      setProgresso(newProgresso)
      
      const progressRef = doc(db, 'userVesperaProgress', user.uid, 'courses', courseId)
      await setDoc(progressRef, {
        progress: newProgresso,
        updatedAt: serverTimestamp(),
      }, { merge: true })
    } catch (error) {
      console.error('Erro ao salvar progresso:', error)
    }
  }
  
  // Gerar PDF
  const generatePDF = () => {
    alert('Funcionalidade de PDF será implementada em breve.')
  }
  
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Carregando...</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
              <SparklesIcon className="h-8 w-8 text-alego-600" />
              Véspera de Prova
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              {courseName}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Modo noturno */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Alternar modo escuro"
            >
              {darkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </button>
            
            {/* Botão de configurar (admin) */}
            {isAdmin && (
              <button
                onClick={() => navigate(`/vespera-de-prova/configurar/${courseId}`)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-alego-600 text-white rounded-lg font-medium hover:bg-alego-700 transition"
              >
                <SparklesIcon className="h-5 w-5" />
                Configurar
              </button>
            )}
            
            {/* Botão de compartilhar (admin) */}
            {isAdmin && generatedMaterial && (
              <button
                onClick={generateShareLink}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-bold hover:opacity-80 transition"
                title="Gerar link temporário de compartilhamento"
              >
                <ShareIcon className="h-5 w-5" />
                Compartilhar
              </button>
            )}
            
            {/* Botão PDF */}
            {generatedMaterial && (
              <button
                onClick={generatePDF}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-600 dark:bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition"
              >
                <DocumentArrowDownIcon className="h-5 w-5" />
                PDF
              </button>
            )}
          </div>
        </div>
        
        {/* Barra de progresso */}
        {generatedMaterial && user && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Progresso de Leitura
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {Object.values(progresso).filter(v => v).length} / {generatedMaterial.material.length}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className="bg-alego-600 h-2 rounded-full transition-all"
                style={{
                  width: `${(Object.values(progresso).filter(v => v).length / generatedMaterial.material.length) * 100}%`
                }}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Estado inicial - sem material gerado */}
      {!generatedMaterial && (
        <div className="text-center py-16">
          <SparklesIcon className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Material de Véspera de Prova
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
            {isAdmin 
              ? 'Configure e gere o material de revisão personalizado para este concurso.'
              : 'O material de revisão ainda não foi gerado para este curso.'}
          </p>
          {isAdmin && (
            <button
              onClick={() => navigate(`/vespera-de-prova/configurar/${courseId}`)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-alego-600 text-white rounded-lg font-medium hover:bg-alego-700 transition"
            >
              <SparklesIcon className="h-5 w-5" />
              Configurar e Gerar
            </button>
          )}
        </div>
      )}
      
      {/* Material gerado - Visualização */}
      {generatedMaterial && (
        <div className="space-y-8">
          {generatedMaterial.material.map((disciplina, idx) => (
            <div
              key={idx}
              className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden ${
                darkMode ? 'border border-slate-700' : ''
              }`}
            >
              {/* Header da disciplina */}
              <div
                className="p-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => setMateriaExpandida(materiaExpandida === idx ? null : idx)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Checkbox de progresso */}
                    {user && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleMateriaLida(idx)
                        }}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          progresso[idx]
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-slate-300 dark:border-slate-600 hover:border-alego-600'
                        }`}
                      >
                        {progresso[idx] && <CheckIcon className="h-4 w-4" />}
                      </button>
                    )}
                    
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span className="text-alego-600">0{idx + 1}.</span>
                        {disciplina.disciplina.toUpperCase()}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {disciplina.questoes?.length || 0} questões preditivas
                      </p>
                    </div>
                  </div>
                  
                  <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                    {materiaExpandida === idx ? (
                      <ChevronUpIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
              
              {/* Conteúdo da disciplina */}
              {materiaExpandida === idx && (
                <div className="border-t border-slate-200 dark:border-slate-700 p-6 space-y-8">
                  {/* Raio-X de Probabilidade */}
                  {disciplina.raioX && (
                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <FireIcon className="h-6 w-6 text-orange-600" />
                        <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          Raio-X de Probabilidade
                        </h4>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            🔥 Top 3 Assuntos Quentes:
                          </h5>
                          <ul className="space-y-1">
                            {disciplina.raioX.topAssuntos?.map((assunto, aIdx) => (
                              <li key={aIdx} className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                <span className="text-orange-600 font-bold">{aIdx + 1}.</span>
                                {assunto}
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            📊 O Padrão da Banca:
                          </h5>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {disciplina.raioX.padraoBanca}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Revisão Turbo */}
                  {disciplina.revisaoTurbo && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <LightBulbIcon className="h-6 w-6 text-blue-600" />
                        <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          Revisão Turbo
                        </h4>
                      </div>
                      
                      <div className="space-y-4">
                        {disciplina.revisaoTurbo.resumos?.length > 0 && (
                          <div>
                            <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              ⚡ Resumos:
                            </h5>
                            <ul className="space-y-2">
                              {disciplina.revisaoTurbo.resumos.map((resumo, rIdx) => (
                                <li key={rIdx} className="text-sm text-slate-600 dark:text-slate-400">
                                  • {resumo}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {disciplina.revisaoTurbo.pegadinhas?.length > 0 && (
                          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                            <h5 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                              <ExclamationTriangleIcon className="h-4 w-4" />
                              Cuidado, Caçapa!
                            </h5>
                            <ul className="space-y-1">
                              {disciplina.revisaoTurbo.pegadinhas.map((pegadinha, pIdx) => (
                                <li key={pIdx} className="text-sm text-red-600 dark:text-red-400">
                                  • {pegadinha}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Questões Preditivas */}
                  {disciplina.questoes?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <BookOpenIcon className="h-6 w-6 text-alego-600" />
                        <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          Questões Preditivas
                        </h4>
                      </div>
                      
                      <div className="space-y-6">
                        {disciplina.questoes.map((questao, qIdx) => (
                          <div
                            key={qIdx}
                            className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-6"
                          >
                            <div className="mb-4">
                              <span className="text-xs font-semibold text-alego-600 mb-2 block">
                                Aposta {qIdx + 1} de {disciplina.questoes.length}
                              </span>
                              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">
                                {questao.enunciado}
                              </p>
                            </div>
                            
                            {questao.alternativas && (
                              <div className="space-y-2 mb-4">
                                {questao.alternativas.map((alt, aIdx) => (
                                  <div
                                    key={aIdx}
                                    className={`p-3 rounded-lg text-sm ${
                                      alt === questao.gabarito
                                        ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500 text-green-800 dark:text-green-300'
                                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    {alt}
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {questao.comentario && (
                              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                                <h5 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">
                                  💡 Gabarito Comentado:
                                </h5>
                                <p className="text-sm text-blue-600 dark:text-blue-300 whitespace-pre-line">
                                  {questao.comentario}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default VesperaDeProva
