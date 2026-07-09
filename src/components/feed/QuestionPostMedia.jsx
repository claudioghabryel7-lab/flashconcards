export default function QuestionPostMedia({ post, exportMode = false }) {
  const text = post.questionText || ''
  const mediaType = post.mediaType
  const mediaSrc = post.mediaBase64

  return (
    <div className={`w-full ${exportMode ? '' : 'border-b border-cp-border/40'}`}>
      <div className="px-4 py-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-cp-text">{text}</p>
      </div>
      {mediaSrc && mediaType === 'image' && (
        <img
          src={mediaSrc}
          alt="Anexo da publicação"
          className="max-h-[480px] w-full object-contain bg-black/20"
        />
      )}
      {mediaSrc && mediaType === 'video' && (
        <video
          src={mediaSrc}
          controls
          className="max-h-[480px] w-full bg-black"
          playsInline
        />
      )}
      {mediaSrc && mediaType === 'audio' && (
        <div className="border-t border-cp-border/40 px-4 py-3">
          <audio src={mediaSrc} controls className="w-full" />
        </div>
      )}
    </div>
  )
}
