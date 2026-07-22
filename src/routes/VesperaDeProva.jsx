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
  
  // Função para limpar markdown do texto
  const cleanMarkdown = (text) => {
    if (!text) return ''
    return text
      .replace(/\*\*/g, '') // Remove negrito
      .replace(/\*/g, '') // Remove itálico
      .replace(/•/g, '') // Remove bullet points
      .replace(/__/g, '') // Remove underline
      .replace(/~~/g, '') // Remove tachado
      .replace(/`/g, '') // Remove código inline
      .replace(/\n/g, ' ') // Remove quebras de linha
      .trim()
  }
  
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
  
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
          <p className="mt-4 text-sm text-cp-muted">Carregando…</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate(`/vespera-de-prova/configurar/${courseId}`)}
            className="cp-btn-primary !text-sm"
          >
            <SparklesIcon className="h-4 w-4" />
            Configurar
          </button>
          {generatedMaterial && (
            <button
              onClick={generateShareLink}
              className="cp-btn-ghost !text-sm"
              title="Gerar link temporário de compartilhamento"
            >
              <ShareIcon className="h-4 w-4" />
              Compartilhar
            </button>
          )}
        </div>
      )}

      {generatedMaterial && user && (
        <div className="cp-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">
              Progresso de leitura
            </span>
            <span className="text-xs text-cp-muted">
              {Object.values(progresso).filter((v) => v).length} / {generatedMaterial.material.length}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-cp-border">
            <div
              className="h-full rounded-full bg-cp-accent2 transition-all"
              style={{
                width: `${(Object.values(progresso).filter((v) => v).length / generatedMaterial.material.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {!generatedMaterial && (
        <div className="cp-card px-6 py-14 text-center">
          <SparklesIcon className="mx-auto mb-4 h-12 w-12 text-cp-accent" />
          <h2 className="cp-headline text-xl sm:text-2xl">Material de revisão</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-cp-muted">
            {isAdmin
              ? 'Configure e gere o material de revisão personalizado para este concurso.'
              : 'O material de revisão ainda não foi gerado para este curso.'}
          </p>
          {isAdmin && (
            <button
              onClick={() => navigate(`/vespera-de-prova/configurar/${courseId}`)}
              className="cp-btn-primary mt-6"
            >
              <SparklesIcon className="h-5 w-5" />
              Configurar e Gerar
            </button>
          )}
        </div>
      )}
      
      {/* Material gerado - Visualização */}
      {generatedMaterial && (
        <div className="space-y-4">
          {generatedMaterial.material.map((disciplina, idx) => (
            <div
              key={idx}
              className="cp-card overflow-hidden !p-0"
            >
              {/* Header da disciplina */}
              <div
                className="cursor-pointer p-4 transition-colors hover:bg-cp-surface/60 sm:p-5"
                onClick={() => setMateriaExpandida(materiaExpandida === idx ? null : idx)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {user && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleMateriaLida(idx)
                        }}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          progresso[idx]
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-cp-border hover:border-cp-accent2'
                        }`}
                      >
                        {progresso[idx] && <CheckIcon className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-cp-text sm:text-lg">
                        <span className="font-mono text-cp-accent">{String(idx + 1).padStart(2, '0')}.</span>
                        {disciplina.disciplina.toUpperCase()}
                      </h3>
                      <p className="mt-0.5 text-xs text-cp-muted">
                        {disciplina.questoes?.length || 0} questões preditivas
                      </p>
                    </div>
                  </div>
                  
                  <button className="rounded-lg p-2 text-cp-muted hover:bg-cp-surface hover:text-cp-text">
                    {materiaExpandida === idx ? (
                      <ChevronUpIcon className="h-5 w-5" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
              
              {/* Conteúdo da disciplina */}
              {materiaExpandida === idx && (
                <div className="space-y-6 border-t border-cp-border p-4 sm:p-5">
                  {/* Raio-X de Probabilidade */}
                  {disciplina.raioX && (
                    <div className="rounded-xl border border-cp-accent4/25 bg-cp-accent4/10 p-4 sm:p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <FireIcon className="h-5 w-5 text-cp-accent4" />
                        <h4 className="text-base font-semibold text-cp-text">
                          Raio-X de Probabilidade
                        </h4>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <h5 className="text-sm font-semibold text-cp-text mb-2">
                            🔥 Top 3 Assuntos Quentes:
                          </h5>
                          <ul className="space-y-1">
                            {disciplina.raioX.topAssuntos?.map((assunto, aIdx) => (
                              <li key={aIdx} className="text-sm text-cp-muted flex items-center gap-2">
                                <span className="text-cp-accent font-bold">{aIdx + 1}.</span>
                                {assunto}
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <div>
                          <h5 className="text-sm font-semibold text-cp-text mb-2">
                            📊 O Padrão da Banca:
                          </h5>
                          <p className="text-sm text-cp-muted">
                            {disciplina.raioX.padraoBanca}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Revisão Turbo */}
                  {disciplina.revisaoTurbo && (
                    <div className="bg-accent-cyan/10 rounded-xl p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <LightBulbIcon className="h-6 w-6 text-accent-cyan" />
                        <h4 className="text-lg font-bold text-cp-text">
                          Revisão Turbo
                        </h4>
                      </div>
                      
                      <div className="space-y-4">
                        {disciplina.revisaoTurbo.resumos?.length > 0 && (
                          <div>
                            <h5 className="text-sm font-semibold text-cp-text mb-2">
                              ⚡ Resumos:
                            </h5>
                            <ul className="space-y-2">
                              {disciplina.revisaoTurbo.resumos.map((resumo, rIdx) => (
                                <li 
                                  key={rIdx} 
                                  className="text-sm text-cp-muted"
                                  dangerouslySetInnerHTML={{ __html: resumo }}
                                />
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {disciplina.revisaoTurbo.pegadinhas?.length > 0 && (
                          <div className="bg-red-500/10 rounded-lg p-4">
                            <h5 className="text-sm font-semibold text-red-500 mb-2 flex items-center gap-2">
                              <ExclamationTriangleIcon className="h-4 w-4" />
                              Cuidado, Caçapa!
                            </h5>
                            <ul className="space-y-1">
                              {disciplina.revisaoTurbo.pegadinhas.map((pegadinha, pIdx) => (
                                <li 
                                  key={pIdx} 
                                  className="text-sm text-red-400"
                                  dangerouslySetInnerHTML={{ __html: pegadinha }}
                                />
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
                        <BookOpenIcon className="h-6 w-6 text-cp-accent" />
                        <h4 className="text-lg font-bold text-cp-text">
                          Questões Preditivas
                        </h4>
                      </div>
                      
                      <div className="space-y-6">
                        {disciplina.questoes.map((questao, qIdx) => (
                          <div
                            key={qIdx}
                            className="bg-cp-surface rounded-xl p-6"
                          >
                            <div className="mb-4">
                              <span className="text-xs font-semibold text-cp-accent mb-2 block">
                                Aposta {qIdx + 1} de {disciplina.questoes.length}
                              </span>
                              <p className="text-sm text-cp-text">
                                <span dangerouslySetInnerHTML={{ __html: questao.enunciado }} />
                              </p>
                            </div>
                            
                            {questao.alternativas && (
                              <div className="space-y-2 mb-4">
                                {questao.alternativas.map((alt, aIdx) => (
                                  <div
                                    key={aIdx}
                                    className={`p-3 rounded-lg text-sm ${
                                      alt === questao.gabarito
                                        ? 'bg-green-500/20 border-2 border-green-500 text-green-400'
                                        : 'bg-cp-bg-elevated border border-cp-border text-cp-text'
                                    }`}
                                  >
                                    {alt}
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {questao.comentario && (
                              <div className="bg-accent-cyan/10 rounded-lg p-4">
                                <h5 className="text-sm font-semibold text-accent-cyan mb-2">
                                  💡 Gabarito Comentado:
                                </h5>
                                <p className="text-sm text-cp-muted">
                                  <span dangerouslySetInnerHTML={{ __html: questao.comentario }} />
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
