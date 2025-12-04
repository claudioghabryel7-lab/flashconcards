import { useState, useRef } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'

const CreateStory = ({ onClose }) => {
  const { user, profile } = useAuth()
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione apenas imagens.')
      return
    }

    if (file.size > 1024 * 1024) {
      alert('A imagem é muito grande. Máximo: 1MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      setImagePreview(e.target.result)
      setSelectedImage(file)
    }
    reader.readAsDataURL(file)
  }

  const createStory = async () => {
    if (!imagePreview || !user || uploading) return

    setUploading(true)
    try {
      const storiesRef = collection(db, 'stories')
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + 24) // Expira em 24 horas

      await addDoc(storiesRef, {
        imageBase64: imagePreview,
        authorId: user.uid,
        authorName: profile?.displayName || user.email?.split('@')[0] || 'Usuário',
        authorAvatar: user.photoURL || null,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
      })

      onClose()
    } catch (err) {
      console.error('Erro ao criar story:', err)
      alert(`Erro ao criar story: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Criar Story</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {!imagePreview ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 transition"
          >
            <PhotoIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400 mb-2">Clique para selecionar uma imagem</p>
            <p className="text-sm text-slate-500 dark:text-slate-500">Máximo: 1MB</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-lg overflow-hidden">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-64 object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setImagePreview(null)
                  setSelectedImage(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={createStory}
              disabled={uploading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
            >
              {uploading ? 'Criando story...' : 'Criar Story'}
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />
      </div>
    </div>
  )
}

export default CreateStory

