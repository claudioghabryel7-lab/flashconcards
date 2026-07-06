import { useEffect, useMemo } from 'react'
import { X, Share2, Download, Link2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { downloadFeedPostImage, retryNativeShare } from '../../utils/feedShareExport'

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.11.547 4.092 1.508 5.82L0 24l6.335-1.662A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.77 9.77 0 01-4.978-1.363l-.357-.212-3.756.986 1.002-3.66-.233-.375A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.308.974.974 1.246 2.241 1.308 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.308 3.608-.974.974-2.241 1.246-3.608 1.308-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.308-.974-.974-1.246-2.241-1.308-3.608C2.175 15.747 2.163 15.367 2.163 12s.012-3.584.07-4.85c.062-1.366.334-2.633 1.308-3.608.974-.974 2.241-1.246 3.608-1.308C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.775.13 4.602.402 3.635 1.37 2.668 2.337 2.396 3.51 2.338 4.788 2.28 6.068 2.266 6.477 2.266 12c0 5.523.014 5.932.072 7.212.058 1.277.33 2.45 1.297 3.417.967.967 2.14 1.239 3.417 1.297 1.28.058 1.689.072 7.212.072s5.932-.014 7.212-.072c1.277-.058 2.45-.33 3.417-1.297.967-.967 1.239-2.14 1.297-3.417.058-1.28.072-1.689.072-7.212 0-5.523-.014-5.932-.072-7.212-.058-1.277-.33-2.45-1.297-3.417C21.398.402 20.225.13 18.948.072 17.668.014 17.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}

export default function FeedShareSheet({ data, onClose }) {
  const previewUrl = useMemo(() => (data?.blob ? URL.createObjectURL(data.blob) : null), [data?.blob])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  if (!data) return null

  const { blob, text, publicUrl, post } = data

  const openWhatsApp = async () => {
    const ok = await retryNativeShare({ blob, post, text, publicUrl })
    if (ok) {
      onClose()
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  const openFacebook = async () => {
    const ok = await retryNativeShare({ blob, post, text, publicUrl })
    if (ok) {
      onClose()
      return
    }
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}&quote=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer,width=600,height=400',
    )
  }

  const handleInstagram = async () => {
    const ok = await retryNativeShare({ blob, post, text, publicUrl })
    if (ok) {
      onClose()
      return
    }
    downloadFeedPostImage(blob, `concurseiro-preditivo-${post.id}.png`)
    toast.success('Imagem salva — abra o Instagram e publique nos Stories ou Feed.')
  }

  const handleNativeShare = async () => {
    const ok = await retryNativeShare({ blob, post, text, publicUrl })
    if (ok) onClose()
    else toast.error('Compartilhamento não disponível neste dispositivo.')
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Texto e link copiados!')
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  const handleDownload = () => {
    downloadFeedPostImage(blob, `concurseiro-preditivo-${post.id}.png`)
    toast.success('Imagem salva!')
  }

  const apps = [
    { id: 'native', label: 'Mais apps', icon: Share2, onClick: handleNativeShare, color: 'text-cp-accent' },
    { id: 'whatsapp', label: 'WhatsApp', icon: WhatsAppIcon, onClick: openWhatsApp, color: 'text-emerald-500' },
    { id: 'facebook', label: 'Facebook', icon: FacebookIcon, onClick: openFacebook, color: 'text-blue-500' },
    { id: 'instagram', label: 'Instagram', icon: InstagramIcon, onClick: handleInstagram, color: 'text-pink-500' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Fechar" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-cp-border bg-cp-bg shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-cp-border px-4 py-3">
          <h2 className="font-display text-base font-bold text-cp-text">Compartilhar publicação</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-cp-muted hover:text-cp-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {previewUrl && (
            <div className="mx-auto max-w-[220px] overflow-hidden rounded-xl border border-cp-border shadow-lg">
              <img src={previewUrl} alt="Preview da publicação" className="w-full" />
            </div>
          )}

          <p className="text-center text-xs text-cp-muted">
            A imagem do post será compartilhada com a marca Concurseiro Preditivo
          </p>

          <div className="grid grid-cols-4 gap-3">
            {apps.map(({ id, label, icon: Icon, onClick, color }) => (
              <button
                key={id}
                type="button"
                onClick={onClick}
                className="flex flex-col items-center gap-1.5 rounded-xl p-2 transition hover:bg-cp-surface"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-cp-surface ${color}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="text-[10px] font-medium text-cp-text">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2 border-t border-cp-border pt-3">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cp-border py-2.5 text-sm text-cp-text hover:bg-cp-surface"
            >
              <Link2 className="h-4 w-4" />
              Copiar texto
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cp-border py-2.5 text-sm text-cp-text hover:bg-cp-surface"
            >
              <Download className="h-4 w-4" />
              Salvar imagem
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
