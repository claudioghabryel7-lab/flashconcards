import fs from 'fs'

const lines = fs.readFileSync('functions/index.js', 'utf8').split(/\r?\n/)
const start = 1629
const end = 1870
let body = lines.slice(start, end).join('\n')
body = body.replace(
  /^exports\.generateConcursoNews = functions\.https\.onRequest\(withCors\(async \(req, res\) => \{/,
  'async function handleGenerateConcursoNews(req, res) {',
)
body = body.replace(/\}\)\)\s*$/, '}')

const header = `const admin = require('firebase-admin')
const axios = require('axios')
const { verifyAdminRequest } = require('../emailUtils')
const { collectGeminiApiKeys } = require('../generation/geminiKeyPool')
const { generateAiJson } = require('../generation/geminiServer')

function assertGeminiConfigured() {
  if (!collectGeminiApiKeys().length) {
    const err = new Error('GEMINI_API_KEY não configurada')
    err.status = 500
    throw err
  }
}

`

fs.writeFileSync(
  'functions/handlers/generateConcursoNewsHandler.js',
  `${header}${body}\n\nmodule.exports = { handleGenerateConcursoNews }\n`,
)
console.log('extracted generateConcursoNewsHandler.js')
