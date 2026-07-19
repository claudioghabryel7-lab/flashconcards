/**
 * Deleta todas as Cloud Functions do projeto Firebase (zera custo GCP).
 * Uso: node scripts/delete-all-cloud-functions.mjs
 */
import { spawnSync } from 'child_process'

const project = 'plegi-d84c2'

const list = spawnSync('firebase', ['functions:list', '--project', project, '--json'], {
  encoding: 'utf8',
  shell: true,
})

if (list.status !== 0) {
  console.error(list.stderr || list.stdout)
  process.exit(1)
}

let payload
try {
  payload = JSON.parse(list.stdout)
} catch (err) {
  console.error('Falha ao parsear JSON:', err?.message)
  process.exit(1)
}

const names = [...new Set((payload.result || []).map((fn) => fn.id).filter(Boolean))]
if (!names.length) {
  console.log('Nenhuma function encontrada.')
  process.exit(0)
}

console.log(`Deletando ${names.length} function(s)...`)
for (const name of names) {
  console.log(`  - ${name}`)
  const del = spawnSync('firebase', ['functions:delete', name, '--project', project, '--force'], {
    encoding: 'utf8',
    shell: true,
  })
  if (del.status !== 0) {
    console.error(del.stderr || del.stdout)
  }
}
console.log('Concluído.')
