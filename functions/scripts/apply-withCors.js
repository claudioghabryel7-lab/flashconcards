const fs = require('fs')
const path = require('path')

const indexPath = path.join(__dirname, '..', 'index.js')
let c = fs.readFileSync(indexPath, 'utf8')

c = c.replace(
  /const \{ corsMiddleware: cors \} = require\('\.\/corsConfig'\)/,
  "const { corsMiddleware: cors, withCors } = require('./corsConfig')",
)
c = c.replace(/const \{ wrapCorsHandler \} = require\('\.\/httpUtils'\)\r?\n/, '')

c = c.replace(
  /\.https\.onRequest\(\(req, res\) => \{\r?\n\s*cors\(req, res, async \(\) => \{/g,
  '.https.onRequest(withCors(async (req, res) => {',
)
c = c.replace(
  /functions\.https\.onRequest\(\(req, res\) => \{\r?\n\s*cors\(req, res, async \(\) => \{/g,
  'functions.https.onRequest(withCors(async (req, res) => {',
)
c = c.replace(
  /exports\.(\w+) = functions\.https\.onRequest\(\(req, res\) => \{\r?\n\s*return cors\(req, res, async \(\) => \{/g,
  'exports.$1 = functions.https.onRequest(withCors(async (req, res) => {',
)

c = c.replace(
  /wrapCorsHandler\(\r?\n\s*\(req, res\) => handleCreatePixPayment\(req, res, \{ getMercadoPagoAccessToken \}\),\r?\n\s*cors,\r?\n\s*\)/g,
  'withCors((req, res) => handleCreatePixPayment(req, res, { getMercadoPagoAccessToken }))',
)
c = c.replace(/wrapCorsHandler\(async \(req, res\) => \{/g, 'withCors(async (req, res) => {')
c = c.replace(/\r?\n\s*\}, cors\),\r?\n\s*\)/g, '\r\n  }),')

c = c.replace(/\r?\n  \}\)\r?\n\}\)/g, '\r\n}))\r\n')

fs.writeFileSync(indexPath, c)

const remaining = (c.match(/cors\(req, res/g) || []).length
console.log(`OK: withCors applied (${remaining} cors(req,res remaining)`)
