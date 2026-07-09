/**
 * Copia VITE_GEMINI_API_KEY* do .env.local (raiz) para functions/.env como GEMINI_API_KEY*.
 * Rode antes de `firebase deploy --only functions` se as chaves só existirem no Next.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const sourcePath = path.join(root, '.env.local')
const targetPath = path.join(root, 'functions', '.env')

if (!fs.existsSync(sourcePath)) {
  console.error('Arquivo .env.local não encontrado na raiz do projeto.')
  process.exit(1)
}

const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/)
const geminiLines = []
const seen = new Set()

for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
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
  console.error('Nenhuma VITE_GEMINI_API_KEY* encontrada em .env.local')
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
    return !/^GEMINI_API_KEY(_\d+)?=/.test(t)
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
console.log(`✅ ${geminiLines.length} chave(s) Gemini copiada(s) para functions/.env`)
