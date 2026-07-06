import { Brain, Layers } from 'lucide-react'

function truncate(text = '', max = 280) {
  const t = String(text).replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export default function ItemSharePreview({
  type = 'flashcard',
  materia = '',
  assunto = '',
  itemIndex = 0,
  flashcard = null,
  questao = null,
}) {
  const isFlashcard = type === 'flashcard'
  const Icon = isFlashcard ? Layers : Brain
  const label = isFlashcard ? 'FlashCard' : 'Questão'

  const pergunta = flashcard?.pergunta || flashcard?.frente || ''
  const resposta = flashcard?.resposta || flashcard?.verso || ''
  const enunciado = questao?.enunciado || ''
  const alternativas = questao?.alternativas || []

  const gradient = isFlashcard
    ? 'linear-gradient(135deg, #059669 0%, #10b981 50%, #134e4a 100%)'
    : 'linear-gradient(135deg, #d97706 0%, #f97316 50%, #be123c 100%)'

  return (
    <div
      className="w-[400px] overflow-hidden rounded-2xl text-white shadow-xl"
      style={{ background: gradient }}
    >
      <div className="flex flex-col gap-4 p-6 min-h-[400px]">
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            <Icon className="h-3.5 w-3.5" />
            {label} #{itemIndex + 1}
          </span>
          <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium">
            {materia}
          </span>
        </div>

        <div className="flex-1 space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/75">
            Concurseiro Preditivo
          </p>
          {assunto && (
            <p className="text-xs font-medium text-white/85 line-clamp-2">{assunto}</p>
          )}

          {isFlashcard ? (
            <>
              <div className="rounded-xl bg-white/15 p-4 backdrop-blur-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/70 mb-2">
                  Pergunta
                </p>
                <p className="text-base font-semibold leading-snug">{truncate(pergunta, 320)}</p>
              </div>
              {resposta && (
                <div className="rounded-xl bg-black/25 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/70 mb-2">
                    Resposta
                  </p>
                  <p className="text-sm leading-relaxed text-white/95">{truncate(resposta, 240)}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-xl bg-white/15 p-4 backdrop-blur-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/70 mb-2">
                  Enunciado
                </p>
                <p className="text-sm font-medium leading-relaxed">{truncate(enunciado, 360)}</p>
              </div>
              {alternativas.length > 0 && (
                <div className="space-y-1.5">
                  {alternativas.slice(0, 5).map((alt, i) => {
                    const letra = alt.letra || String.fromCharCode(65 + i)
                    const texto = alt.texto || alt.text || alt
                    return (
                      <div
                        key={letra}
                        className="flex gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm"
                      >
                        <span className="font-bold shrink-0">{letra})</span>
                        <span className="line-clamp-2">{truncate(String(texto), 120)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
