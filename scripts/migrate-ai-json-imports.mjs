/**
 * Adiciona generateAiJson / formatAiErrorForUser aos imports de geminiApi
 * em arquivos que ainda usam callGeminiWithRetry para geração JSON.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve('src')
const FILES = [
  'routes/FlashcardView.jsx',
  'routes/FlashQuestoes.jsx',
  'routes/VesperaDeProvaConfig.jsx',
  'routes/GuiaMentorado.jsx',
  'routes/BlankPage.jsx',
  'routes/Simulado.jsx',
  'routes/SimuladoShare.jsx',
  'routes/MindMapView.jsx',
  'routes/TreinoRedacao.jsx',
  'routes/AdminPanel.jsx',
  'hooks/useStudyPlanner.js',
]

for (const rel of FILES) {
  const file = path.join(ROOT, rel)
  if (!fs.existsSync(file)) continue
  let src = fs.readFileSync(file, 'utf8')
  if (!src.includes("from '../utils/geminiApi'") && !src.includes('from "../utils/geminiApi"')) continue
  if (src.includes('generateAiJson')) continue

  src = src.replace(
    /import \{([^}]+)\} from ['"]\.\.\/utils\/geminiApi['"]/,
    (m, imports) => {
      const parts = imports.split(',').map((s) => s.trim()).filter(Boolean)
      if (!parts.includes('generateAiJson')) parts.push('generateAiJson')
      if (!parts.includes('formatAiErrorForUser')) parts.push('formatAiErrorForUser')
      return `import { ${parts.join(', ')} } from '../utils/geminiApi'`
    },
  )
  fs.writeFileSync(file, src)
  console.log('updated imports:', rel)
}
