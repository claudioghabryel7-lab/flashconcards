import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Share2, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import { useItemShare } from '../../hooks/useItemShare'
import { publishFeedPost } from '../../services/trilhaFeedService'
import { normalizeQuestaoAlternativas } from '../../utils/questaoAlternativas'
import ItemSharePreview from './ItemSharePreview'
import ItemShareSheet from './ItemShareSheet'

export default function ShareItemButton({
  type,
  materia,
  assunto,
  courseId,
  topicKey,
  itemIndex = 0,
  flashcard = null,
  questao = null,
  shareUrl,
  postType,
  className = 'cp-btn-ghost !text-xs',
  disabled = false,
  label = 'Compartilhar',
}) {
  const { user, profile } = useAuth()
  const { captureRef, shareItem, sharing, shareSheet, closeShareSheet } = useItemShare()
  const [publishing, setPublishing] = useState(false)

  const itemPreview =
    type === 'flashcard' && flashcard
      ? {
          type: 'flashcard',
          pergunta: flashcard.pergunta || flashcard.frente,
          resposta: flashcard.resposta || flashcard.verso,
          text: flashcard.pergunta || flashcard.frente || '',
        }
      : type === 'questao' && questao
        ? {
            type: 'questao',
            enunciado: questao.enunciado,
            text: questao.enunciado || '',
            alternativas: normalizeQuestaoAlternativas(questao.alternativas, 5),
            assunto: questao.assunto,
          }
        : null

  const handleShare = async () => {
    if (disabled || sharing) return
    if (type === 'flashcard' && !flashcard) {
      toast.error('Nenhum flashcard selecionado.')
      return
    }
    if (type === 'questao' && !questao) {
      toast.error('Nenhuma questão selecionada.')
      return
    }

    await shareItem({
      type,
      materia,
      assunto,
      itemIndex,
      shareUrl,
    })
  }

  const handlePublishCommunity = async () => {
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
      const postId = await publishFeedPost({
        user,
        profile,
        data: {
          postType,
          materia,
          assunto,
          courseId,
          topicKey,
          shareUrl,
          itemCount: 1,
          itemIndex,
          itemPreview,
        },
      })
      if (!postId) {
        toast.error('Não foi possível publicar.')
        return
      }
      closeShareSheet()
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
    <>
      <button
        type="button"
        onClick={handleShare}
        disabled={disabled || sharing || publishing}
        className={className}
      >
        <Share2 className="h-4 w-4" />
        {sharing ? 'Preparando...' : label}
      </button>

      <div ref={captureRef} className="pointer-events-none fixed -left-[9999px] top-0 z-[-1]">
        <ItemSharePreview
          type={type}
          materia={materia}
          assunto={assunto}
          itemIndex={itemIndex}
          flashcard={flashcard}
          questao={questao}
        />
      </div>

      {shareSheet && (
        <ItemShareSheet
          data={shareSheet}
          onClose={closeShareSheet}
          onPublishCommunity={user ? handlePublishCommunity : null}
          publishing={publishing}
        />
      )}
    </>
  )
}
