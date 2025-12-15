import { useState, useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { getSubjectOrder, getModuleOrder } from '../utils/subjectOrder'

/**
 * Hook para gerenciar ordem de matérias e módulos
 */
export function useSubjectOrder(courseId, userId) {
  const [subjectOrderConfig, setSubjectOrderConfig] = useState(null)
  const [moduleOrderConfigs, setModuleOrderConfigs] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!courseId && courseId !== null) {
      setLoading(false)
      return
    }

    let unsubscribeAdmin = null
    let unsubscribeUser = null

    const loadOrder = async () => {
      try {
        // Carregar ordem inicial
        const orderConfig = await getSubjectOrder(courseId, userId)
        setSubjectOrderConfig(orderConfig)
        setLoading(false)
      } catch (error) {
        console.error('Erro ao carregar ordem:', error)
        setLoading(false)
      }
    }

    loadOrder()

    // Escutar mudanças na ordem do admin
    const courseConfigRef = doc(db, 'courses', courseId || 'alego-default', 'config', 'order')
    unsubscribeAdmin = onSnapshot(courseConfigRef, async (snapshot) => {
      if (snapshot.exists()) {
        const config = snapshot.data()
        if (config.subjectOrder) {
          setSubjectOrderConfig({
            order: config.subjectOrder,
            source: 'admin',
            isCustom: false
          })
        }
      } else {
        // Se não existe ordem do admin, verificar ordem do usuário
        const orderConfig = await getSubjectOrder(courseId, userId)
        setSubjectOrderConfig(orderConfig)
      }
    }, (error) => {
      console.error('Erro ao escutar ordem do admin:', error)
    })

    // Escutar mudanças na ordem personalizada do usuário
    if (userId) {
      const userProgressRef = doc(db, 'userProgress', userId)
      unsubscribeUser = onSnapshot(userProgressRef, async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          const customOrder = data.customOrder || {}
          const courseCustomOrder = customOrder[courseId || 'alego-default']
          
          if (courseCustomOrder && courseCustomOrder.isCustom) {
            setSubjectOrderConfig({
              order: courseCustomOrder.subjectOrder,
              source: 'user',
              isCustom: true
            })
          } else {
            // Se usuário removeu ordem personalizada, recarregar ordem do admin
            const orderConfig = await getSubjectOrder(courseId, userId)
            setSubjectOrderConfig(orderConfig)
          }
        }
      }, (error) => {
        console.error('Erro ao escutar ordem do usuário:', error)
      })
    }

    return () => {
      if (unsubscribeAdmin) unsubscribeAdmin()
      if (unsubscribeUser) unsubscribeUser()
    }
  }, [courseId, userId])

  /**
   * Carrega ordem de módulos para uma matéria específica
   */
  const loadModuleOrder = async (materia) => {
    if (moduleOrderConfigs[materia]) {
      return moduleOrderConfigs[materia]
    }

    try {
      const orderConfig = await getModuleOrder(courseId, userId, materia)
      setModuleOrderConfigs(prev => ({
        ...prev,
        [materia]: orderConfig
      }))
      return orderConfig
    } catch (error) {
      console.error('Erro ao carregar ordem de módulos:', error)
      return {
        order: null,
        source: 'default',
        isCustom: false
      }
    }
  }

  return {
    subjectOrderConfig,
    moduleOrderConfigs,
    loadModuleOrder,
    loading
  }
}


















