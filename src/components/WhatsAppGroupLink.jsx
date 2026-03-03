import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { 
  ChatBubbleLeftRightIcon, 
  PencilIcon, 
  CheckIcon, 
  XMarkIcon,
  ShareIcon
} from '@heroicons/react/24/outline'
import { ChatBubbleLeftRightIcon as ChatBubbleSolid } from '@heroicons/react/24/solid'

const WhatsAppGroupLink = () => {
  const { profile } = useAuth()
  const [whatsappLink, setWhatsappLink] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [tempLink, setTempLink] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const isAdmin = profile?.role === 'admin'

  // Carregar link do WhatsApp do Firestore
  useEffect(() => {
    const loadWhatsAppLink = async () => {
      try {
        const configRef = doc(db, 'config', 'whatsapp')
        const configDoc = await getDoc(configRef)
        
        if (configDoc.exists()) {
          const data = configDoc.data()
          setWhatsappLink(data.groupLink || '')
        }
      } catch (error) {
        console.error('Erro ao carregar link do WhatsApp:', error)
      } finally {
        setLoading(false)
      }
    }

    loadWhatsAppLink()
  }, [])

  // Salvar link do WhatsApp
  const handleSave = async () => {
    if (!tempLink.trim()) {
      alert('Por favor, insira um link válido do WhatsApp')
      return
    }

    // Validar se é um link do WhatsApp
    if (!tempLink.includes('wa.me/') && !tempLink.includes('whatsapp.com/')) {
      alert('Por favor, insira um link válido do WhatsApp (ex: https://wa.me/55XXXXXXXXXX)')
      return
    }

    setSaving(true)
    try {
      const configRef = doc(db, 'config', 'whatsapp')
      await setDoc(configRef, {
        groupLink: tempLink.trim(),
        updatedAt: new Date().toISOString()
      }, { merge: true })

      setWhatsappLink(tempLink.trim())
      setIsEditing(false)
      setTempLink('')
    } catch (error) {
      console.error('Erro ao salvar link do WhatsApp:', error)
      alert('Erro ao salvar o link. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // Cancelar edição
  const handleCancel = () => {
    setIsEditing(false)
    setTempLink('')
  }

  // Abrir link do WhatsApp
  const handleOpenWhatsApp = () => {
    if (whatsappLink) {
      window.open(whatsappLink, '_blank')
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded mb-4 w-1/3"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <ChatBubbleSolid className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Grupo WhatsApp
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Entre no grupo de estudos
            </p>
          </div>
        </div>
        
        {isAdmin && (
          <button
            onClick={() => {
              setIsEditing(true)
              setTempLink(whatsappLink)
            }}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            title="Editar link do WhatsApp"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {isEditing && isAdmin ? (
        // Modo de edição (apenas admin)
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Link do Grupo WhatsApp
            </label>
            <input
              type="url"
              value={tempLink}
              onChange={(e) => setTempLink(e.target.value)}
              placeholder="https://wa.me/55XXXXXXXXXX"
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Use o formato: https://wa.me/55XXXXXXXXXX ou https://chat.whatsapp.com/XXXXX
            </p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent mr-2"></div>
                  Salvando...
                </>
              ) : (
                <>
                  <CheckIcon className="h-4 w-4 inline-block mr-2" />
                  Salvar
                </>
              )}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <XMarkIcon className="h-4 w-4 inline-block mr-2" />
              Cancelar
            </button>
          </div>
        </div>
      ) : whatsappLink ? (
        // Link configurado - mostrar botão para entrar
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            Participe do nosso grupo de WhatsApp para tirar dúvidas, compartilhar dicas e estudar junto com outros alunos!
          </p>
          <button
            onClick={handleOpenWhatsApp}
            className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-green-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
            <ChatBubbleLeftRightIcon className="h-5 w-5" />
            Entrar no Grupo
            <ShareIcon className="h-4 w-4" />
          </button>
        </div>
      ) : (
        // Sem link configurado
        <div className="text-center py-6">
          <ChatBubbleLeftRightIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            {isAdmin 
              ? "Configure o link do grupo de WhatsApp para que os alunos possam participar."
              : "Grupo de WhatsApp não disponível no momento. Volte em breve!"
            }
          </p>
        </div>
      )}
    </div>
  )
}

export default WhatsAppGroupLink
