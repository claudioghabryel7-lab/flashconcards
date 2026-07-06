import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import { publishFeedPost } from '../../services/trilhaFeedService'

export default function ShareToFeedButton({
  postType,
  materia,
  assunto,
  courseId,
  topicKey,
  shareToken,
  shareId,
  shareUrl,
  itemCount,
  prepareShare,
  label = 'Compartilhar na comunidade',
  className = 'cp-btn-ghost !text-xs',
  disabled = false,
}) {
  const { user, profile } = useAuth()
  const [publishing, setPublishing] = useState(false)

  const handlePublish = async () => {
    if (!user) {
      toast.error('Faça login para publicar na comunidade.')
      return
    }
    if (profile?.shareTrilhaToFeed === false) {
      toast.error('Ative compartilhamento na comunidade nas configurações do perfil.')
      return
    }

    setPublishing(true)
    try {
      let extra = {}
      if (prepareShare) {
        extra = (await prepareShare()) || {}
      }

      const postId = await publishFeedPost({
        user,
        profile,
        data: {
          postType,
          materia,
          assunto,
          courseId,
          topicKey,
          shareToken: extra.shareToken ?? shareToken,
          shareId: extra.shareId ?? shareId,
          shareUrl: extra.shareUrl ?? shareUrl,
          itemCount: extra.itemCount ?? itemCount,
        },
      })
      if (!postId) {
        toast.error('Não foi possível publicar.')
        return
      }
      toast.success(
        (t) => (
          <span>
            Publicado na comunidade!{' '}
            <Link
              to={`/comunidade/publicacao/${postId}`}
              className="font-semibold underline"
              onClick={() => toast.dismiss(t.id)}
            >
              Ver post
            </Link>
          </span>
        ),
        { duration: 5000 },
      )
    } catch (err) {
      console.error(err)
      toast.error('Erro ao publicar na comunidade.')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handlePublish}
      disabled={disabled || publishing}
      className={className}
    >
      <Users className="h-4 w-4" />
      {publishing ? 'Publicando...' : label}
    </button>
  )
}
