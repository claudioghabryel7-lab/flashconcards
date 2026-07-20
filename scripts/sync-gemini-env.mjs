/**
 * Copia VITE_GEMINI_API_KEY do .env.local ou .env (raiz) para functions/.env como GEMINI_API_KEY.
 * Somente a chave principal — chaves numeradas / MOTHER / Groq não são sincronizadas.
 * Rode antes de `firebase deploy --only functions` se a chave só existir no Next.
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
let geminiValue = null

for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue

  const match = trimmed.match(/^VITE_GEMINI_API_KEY=(.+)$/)
  if (!match) continue

  geminiValue = match[1].trim().replace(/^["']|["']$/g, '')
  break
}

if (!geminiValue) {
  console.error(`Nenhuma VITE_GEMINI_API_KEY encontrada em ${path.basename(sourcePath)}`)
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
    // Remove chaves Gemini antigas (principal, numeradas, mother)
    return !/^GEMINI_API_KEY(_\d+|_MAE)?(=|$)/.test(t) && !/^VITE_GEMINI_API_KEY(_\d+|_MAE)?(=|$)/.test(t)
  })
  .join('\n')
  .trimEnd()

const header = [
  '# Gerado por npm run sync:gemini-env — não commitar',
  `# ${new Date().toISOString()}`,
  '',
].join('\n')

const geminiLines = [
  `GEMINI_API_KEY=${geminiValue}`,
  `VITE_GEMINI_API_KEY=${geminiValue}`,
]

const output = [preserved, header, ...geminiLines, ''].filter(Boolean).join('\n')
fs.writeFileSync(targetPath, output, 'utf8')
console.log(
  `✅ Chave Gemini única copiada de ${path.basename(sourcePath)} → functions/.env`,
)
