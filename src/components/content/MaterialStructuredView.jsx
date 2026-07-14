import {
  FireIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import CommentFormattedText from './CommentFormattedText'
import { sortAlternativasEntries } from '../../utils/questaoAlternativas'

function RichHtml({ html, className = '' }) {
  if (!html) return null
  return (
    <div
      className={`ia-content-enhanced text-base text-slate-600 dark:text-slate-400 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default function MaterialStructuredView({
  material,
  transformHtml = (value) => value,
  showLegacyContent = true,
}) {
  if (!material) return null

  const raioX = material.raioXProbabilidade
  const revisaoTurbo = material.revisaoTurbo || []
  const pegadinhas = material.pegadinhas || []
  const questoes = material.questoesPreditivas || []
  const secoes = material.secoes || []
  const hasStructured =
    raioX?.topicosQuentes?.length ||
    revisaoTurbo.length ||
    pegadinhas.length ||
    questoes.length

  return (
    <div className="space-y-8">
      {raioX && (raioX.topicosQuentes?.length > 0 || raioX.padraoBanca) && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FireIcon className="h-6 w-6 text-orange-600" />
            <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Raio-X de Probabilidade
            </h4>
          </div>

          {raioX.topicosQuentes?.length > 0 && (
            <div className="mb-4">
              <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Top Assuntos Quentes
              </h5>
              <ul className="space-y-1">
                {raioX.topicosQuentes.map((assunto, idx) => (
                  <li
                    key={`${assunto}-${idx}`}
                    className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2"
                  >
                    <span className="text-orange-600 font-bold">{idx + 1}.</span>
                    {assunto}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {raioX.padraoBanca && (
            <div>
              <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                O Padrão da Banca
              </h5>
              <RichHtml html={transformHtml(raioX.padraoBanca)} />
            </div>
          )}
        </div>
      )}

      {revisaoTurbo.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <LightBulbIcon className="h-6 w-6 text-blue-600" />
            <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">Revisão Turbo</h4>
          </div>
          <div className="space-y-5">
            {revisaoTurbo.map((resumo, idx) => (
              <div key={`${resumo.titulo}-${idx}`} className="pb-2">
                <h5 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 text-base">
                  {resumo.titulo}
                </h5>
                <RichHtml html={transformHtml(resumo.conteudo)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {pegadinhas.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
            <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Cuidado, Caçapa!
            </h4>
          </div>
          <div className="space-y-4">
            {pegadinhas.map((pegadinha, idx) => (
              <div key={`peg-${idx}`} className="text-sm text-red-600 dark:text-red-400">
                <h5 className="font-semibold mb-2">{pegadinha.titulo}</h5>
                <RichHtml
                  html={transformHtml(pegadinha.conteudo)}
                  className="text-red-600 dark:text-red-400"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {questoes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BookOpenIcon className="h-6 w-6 text-alego-600" />
            <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Questões Preditivas
            </h4>
          </div>
          <div className="space-y-6">
            {questoes.map((questao, idx) => (
              <div
                key={`q-${idx}`}
                className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-6"
              >
                <span className="text-xs font-semibold text-alego-600 mb-2 block">
                  Aposta {idx + 1} de {questoes.length}
                </span>
                <CommentFormattedText
                  text={questao.enunciado}
                  className="text-sm text-slate-700 dark:text-slate-300 mb-4"
                />
                {questao.alternativas && (
                  <div className="space-y-2 mb-4">
                    {sortAlternativasEntries(questao.alternativas).map(([letra, alt]) => (
                      <div
                        key={letra}
                        className={`p-3 rounded-lg text-sm ${
                          letra === questao.correta
                            ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500 text-green-800 dark:text-green-300'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {letra}) {alt}
                      </div>
                    ))}
                  </div>
                )}
                {questao.gabaritoComentado && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <h5 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">
                      Gabarito Comentado
                    </h5>
                    <RichHtml
                      html={transformHtml(questao.gabaritoComentado)}
                      className="text-blue-600 dark:text-blue-300"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showLegacyContent && material.content && !hasStructured && (
        <div className="mb-8">
          <RichHtml html={transformHtml(material.content)} />
        </div>
      )}

      {secoes.length > 0 && (
        <div className="space-y-8">
          {secoes.map((secao, index) => (
            <div
              key={`sec-${index}`}
              className="border-l-4 border-alego-500 pl-6 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-r-lg"
            >
              <h3 className="text-xl font-semibold text-alego-600 dark:text-alego-400 mb-3">
                {secao.titulo || `Seção ${index + 1}`}
                {secao.tipo && (
                  <span className="ml-3 text-sm bg-alego-100 dark:bg-alego-900 text-alego-700 dark:text-alego-300 px-3 py-1 rounded-full">
                    {secao.tipo}
                  </span>
                )}
              </h3>
              <RichHtml html={transformHtml(secao.conteudo)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
