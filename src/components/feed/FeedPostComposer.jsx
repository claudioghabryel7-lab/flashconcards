import { useEffect, useRef, useState } from 'react'
import { Camera, Film, Mic, Send, Square, X } from 'lucide-react'
import toast from 'react-hot-toast'
import UserAvatar from '../UserAvatar'
import { readImageAsBase64 } from '../../utils/imageBase64'
import { publishCommunityQuestion } from '../../services/trilhaFeedService'
import { useInlineMediaRecorder } from '../../hooks/useInlineMediaRecorder'

export default function FeedPostComposer({ user, profile }) {
  const [text, setText] = useState('')
  const [media, setMedia] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [showVideoPreview, setShowVideoPreview] = useState(false)
  const photoInputRef = useRef(null)
  const videoPreviewRef = useRef(null)
  const pendingRecordingRef = useRef(null)

  const {
    recording,
    recordingMode,
    elapsedSec,
    previewStream,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useInlineMediaRecorder()

  useEffect(() => {
    if (!videoPreviewRef.current || !previewStream) return
    videoPreviewRef.current.srcObject = previewStream
    videoPreviewRef.current.play().catch(() => {})
  }, [previewStream, showVideoPreview])

  if (!user) return null

  const clearMedia = () => {
    setMedia(null)
    setShowVideoPreview(false)
    pendingRecordingRef.current = null
  }

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

  const beginVideoRecording = async () => {
    try {
      setShowVideoPreview(true)
      pendingRecordingRef.current = startRecording('video')
    } catch (err) {
      setShowVideoPreview(false)
      cancelRecording()
      toast.error(err.message || 'Não foi possível acessar a câmera.')
    }
  }

  const finishVideoRecording = async () => {
    stopRecording()
    try {
      const result = await pendingRecordingRef.current
      if (result) {
        setMedia(result)
        toast.success('Vídeo gravado!')
      }
    } catch (err) {
      toast.error(err.message || 'Erro ao gravar vídeo.')
    } finally {
      setShowVideoPreview(false)
      pendingRecordingRef.current = null
    }
  }

  const handleAudioPressStart = async () => {
    try {
      pendingRecordingRef.current = startRecording('audio')
    } catch (err) {
      toast.error(err.message || 'Não foi possível acessar o microfone.')
    }
  }

  const handleAudioPressEnd = async () => {
    if (!recording || recordingMode !== 'audio') return
    stopRecording()
    try {
      const result = await pendingRecordingRef.current
      if (result) {
        setMedia(result)
        toast.success('Áudio gravado!')
      }
    } catch (err) {
      toast.error(err.message || 'Erro ao gravar áudio.')
    } finally {
      pendingRecordingRef.current = null
    }
  }

  const handlePublish = async () => {
    const questionText = text.trim()
    if (!questionText && !media) {
      toast.error('Escreva sua dúvida ou grave uma mídia.')
      return
    }
    setPublishing(true)
    try {
      await publishCommunityQuestion({
        user,
        profile,
        data: {
          questionText: questionText || '(publicação com mídia)',
          mediaType: media?.type || null,
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
            placeholder="Tem alguma dúvida? Publique aqui para a comunidade..."
            rows={3}
            className="w-full resize-none rounded-xl border border-cp-border bg-cp-surface px-3 py-2.5 text-sm text-cp-text outline-none placeholder:text-cp-muted focus:border-cp-accent/50"
          />

          {recording && recordingMode === 'audio' && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              Gravando áudio... {elapsedSec}s (solte para finalizar)
            </div>
          )}

          {media && (
            <div className="relative overflow-hidden rounded-xl border border-cp-border bg-cp-surface">
              <button
                type="button"
                onClick={clearMedia}
                className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-1 text-white"
                aria-label="Remover mídia"
              >
                <X className="h-4 w-4" />
              </button>
              {media.type === 'image' && (
                <img src={media.dataUrl} alt="Prévia" className="max-h-48 w-full object-contain" />
              )}
              {media.type === 'video' && (
                <video src={media.dataUrl} controls className="max-h-48 w-full" playsInline />
              )}
              {media.type === 'audio' && (
                <div className="p-3">
                  <audio src={media.dataUrl} controls className="w-full" />
                </div>
              )}
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
                title="Tirar foto agora"
              >
                <Camera className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={beginVideoRecording}
                disabled={recording}
                className="rounded-lg p-2 text-cp-muted transition hover:bg-cp-surface hover:text-cp-accent disabled:opacity-40"
                title="Gravar vídeo agora"
              >
                <Film className="h-5 w-5" />
              </button>
              <button
                type="button"
                onMouseDown={handleAudioPressStart}
                onMouseUp={handleAudioPressEnd}
                onMouseLeave={recordingMode === 'audio' ? handleAudioPressEnd : undefined}
                onTouchStart={(e) => {
                  e.preventDefault()
                  handleAudioPressStart()
                }}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  handleAudioPressEnd()
                }}
                disabled={recording && recordingMode === 'video'}
                className={`rounded-lg p-2 transition ${
                  recording && recordingMode === 'audio'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'text-cp-muted hover:bg-cp-surface hover:text-cp-accent'
                }`}
                title="Segure para gravar áudio"
              >
                <Mic className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing || recording}
              className="inline-flex items-center gap-1.5 rounded-full bg-cp-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {publishing ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>

      {showVideoPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-cp-border bg-cp-surface p-4">
            <p className="mb-3 text-center text-sm font-semibold text-cp-text">
              {recording && recordingMode === 'video'
                ? `Gravando vídeo... ${elapsedSec}s`
                : 'Preparando câmera...'}
            </p>
            <video
              ref={videoPreviewRef}
              className="aspect-square w-full rounded-xl bg-black object-cover"
              muted
              playsInline
            />
            <div className="mt-4 flex justify-center gap-3">
              {recording && recordingMode === 'video' ? (
                <button
                  type="button"
                  onClick={finishVideoRecording}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Parar
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  cancelRecording()
                  setShowVideoPreview(false)
                  pendingRecordingRef.current = null
                }}
                className="rounded-full border border-cp-border px-5 py-2.5 text-sm text-cp-muted"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
