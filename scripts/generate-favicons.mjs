/**
 * Gera favicons em tamanhos exigidos pelo Google (mín. 48×48) a partir do logo.
 * Uso: node scripts/generate-favicons.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const source = path.join(root, 'public/course-icons/logo.png')

const outputs = [
  { file: 'public/favicon-48x48.png', size: 48 },
  { file: 'public/favicon-96x96.png', size: 96 },
  { file: 'public/favicon-192x192.png', size: 192 },
  { file: 'public/favicon.png', size: 48 },
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'src/app/icon.png', size: 48 },
  { file: 'src/app/apple-icon.png', size: 180 },
]

async function main() {
  if (!fs.existsSync(source)) {
    console.error('Logo não encontrado:', source)
    process.exit(1)
  }

  const tmpDir = path.join(root, '.tmp-favicons')
  fs.mkdirSync(tmpDir, { recursive: true })

  for (const { file, size } of outputs) {
    const dest = path.join(root, file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    await sharp(source)
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 9 })
      .toFile(dest)
    console.log('✓', file)
  }

  const icoSizes = [16, 32, 48]
  const icoPaths = []
  for (const size of icoSizes) {
    const p = path.join(tmpDir, `favicon-${size}.png`)
    await sharp(source).resize(size, size, { fit: 'cover' }).png().toFile(p)
    icoPaths.push(p)
  }

  const icoBuffer = await pngToIco(icoPaths)
  for (const dest of ['public/favicon.ico', 'src/app/favicon.ico']) {
    fs.writeFileSync(path.join(root, dest), icoBuffer)
    console.log('✓', dest)
  }

  fs.rmSync(tmpDir, { recursive: true, force: true })
  console.log('\nFavicons gerados com sucesso.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
