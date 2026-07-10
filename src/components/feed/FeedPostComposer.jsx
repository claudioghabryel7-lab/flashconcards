import { useRef, useState } from 'react'
import { Camera, Send, X } from 'lucide-react'
import toast from 'react-hot-toast'
import UserAvatar from '../UserAvatar'
import { readImageAsBase64 } from '../../utils/imageBase64'
import { publishCommunityQuestion } from '../../services/trilhaFeedService'

export default function FeedPostComposer({ user, profile }) {
  const [text, setText] = useState('')
  const [media, setMedia] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const photoInputRef = useRef(null)

  if (!user) return null

  const clearMedia = () => setMedia(null)

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await readImageAsBase64(file, 720)
      setMedia({ type: 'image', dataUrl, mimeType: 'image/jpeg' })
    } catch (err) {
      toast.error(err.message || 'Erro ao capturar foto.')
    }
  }

  const handlePublish = async () => {
    const questionText = text.trim()
    if (!questionText && !media) {
      toast.error('Escreva algo ou adicione uma foto para publicar.')
      return
    }
    setPublishing(true)
    try {
      await publishCommunityQuestion({
        user,
        profile,
        data: {
          questionText: questionText || '(publicação com foto)',
          mediaType: media?.type === 'image' ? 'image' : null,
          mediaBase64: media?.dataUrl || null,
          mediaMimeType: media?.mimeType || null,
        },
      })
      setText('')
      setMedia(null)
      toast.success('Publicação enviada!')
    } catch {
      toast.error('Não foi possível publicar.')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="border-b border-cp-border bg-cp-bg px-3 py-4">
      <div className="flex gap-3">
        <UserAvatar
          photoBase64={profile?.photoBase64}
          name={profile?.displayName || user.email}
          size="sm"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Compartilhe uma dúvida, dica ou foto com a comunidade..."
            rows={3}
            className="w-full resize-none rounded-xl border border-cp-border bg-cp-surface px-3 py-2.5 text-sm text-cp-text outline-none placeholder:text-cp-muted focus:border-cp-accent/50"
          />

          {media?.type === 'image' && (
            <div className="relative overflow-hidden rounded-xl border border-cp-border bg-cp-surface">
              <button
                type="button"
                onClick={clearMedia}
                className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-1 text-white"
                aria-label="Remover foto"
              >
                <X className="h-4 w-4" />
              </button>
              <img src={media.dataUrl} alt="Prévia" className="max-h-48 w-full object-contain" />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="rounded-lg p-2 text-cp-muted transition hover:bg-cp-surface hover:text-cp-accent"
                title="Adicionar foto"
              >
                <Camera className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="inline-flex items-center gap-1.5 rounded-full bg-cp-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {publishing ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
