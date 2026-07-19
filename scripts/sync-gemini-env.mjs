/**
 * Copia VITE_GEMINI_API_KEY* do .env.local ou .env (raiz) para functions/.env como GEMINI_API_KEY*.
 * Inclui VITE_GEMINI_API_KEY_MAE → GEMINI_API_KEY_MAE (CHAVE MOTHER).
 * Rode antes de `firebase deploy --only functions` se as chaves só existirem no Next.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const targetPath = path.join(root, 'functions', '.env')

const sourceCandidates = [
  path.join(root, '.env.local'),
  path.join(root, '.env'),
]
const sourcePath = sourceCandidates.find((p) => fs.existsSync(p))

if (!sourcePath) {
  console.error('Nenhum .env.local ou .env encontrado na raiz do projeto.')
  process.exit(1)
}

const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/)
const geminiLines = []
const seen = new Set()

for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue

  const mother = trimmed.match(/^VITE_GEMINI_API_KEY_MAE=(.+)$/)
  if (mother) {
    const value = mother[1].trim().replace(/^["']|["']$/g, '')
    if (!seen.has('GEMINI_API_KEY_MAE')) {
      seen.add('GEMINI_API_KEY_MAE')
      geminiLines.push(`GEMINI_API_KEY_MAE=${value}`)
    }
    continue
  }

  const match = trimmed.match(/^VITE_GEMINI_API_KEY(_\d+)?=(.+)$/)
  if (!match) continue

  const suffix = match[1] || ''
  const value = match[2].trim().replace(/^["']|["']$/g, '')
  const targetKey = `GEMINI_API_KEY${suffix}`
  if (seen.has(targetKey)) continue
  seen.add(targetKey)
  geminiLines.push(`${targetKey}=${value}`)
}

if (geminiLines.length === 0) {
  console.error(`Nenhuma VITE_GEMINI_API_KEY* encontrada em ${path.basename(sourcePath)}`)
  process.exit(1)
}

let existing = ''
if (fs.existsSync(targetPath)) {
  existing = fs.readFileSync(targetPath, 'utf8')
}

const preserved = existing
  .split(/\r?\n/)
  .filter((line) => {
    const t = line.trim()
    if (!t || t.startsWith('#')) return true
    return !/^GEMINI_API_KEY(_\d+)?(=|$)/.test(t) && !/^GEMINI_API_KEY_MAE=/.test(t)
  })
  .join('\n')
  .trimEnd()

const header = [
  '# Gerado por npm run sync:gemini-env — não commitar',
  `# ${new Date().toISOString()}`,
  '',
].join('\n')

const output = [preserved, header, ...geminiLines, ''].filter(Boolean).join('\n')
fs.writeFileSync(targetPath, output, 'utf8')
console.log(
  `✅ ${geminiLines.length} chave(s) Gemini copiada(s) de ${path.basename(sourcePath)} → functions/.env (inclui CHAVE MOTHER se houver)`,
)
