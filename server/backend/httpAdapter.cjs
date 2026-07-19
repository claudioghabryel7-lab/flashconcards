/**
 * Adapta Request (Next.js) → handler Firebase (req, res) e retorna resposta HTTP.
 */
const { corsMiddleware } = require('../../functions/corsConfig')

function createMockReq(request, body = null) {
  const url = new URL(request.url)
  const headers = {}
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  return {
    method: request.method,
    headers,
    header(name) {
      return headers[String(name).toLowerCase()]
    },
    get(name) {
      return headers[String(name).toLowerCase()]
    },
    body: body ?? {},
    query: Object.fromEntries(url.searchParams.entries()),
    path: url.pathname,
    url: url.pathname + url.search,
  }
}

function createMockRes() {
  let statusCode = 200
  const headers = {}
  let body = null
  let ended = false
  const res = {
    status(code) {
      statusCode = code
      return res
    },
    setHeader(key, value) {
      headers[key.toLowerCase()] = value
      return res
    },
    getHeader(key) {
      return headers[key.toLowerCase()]
    },
    json(data) {
      body = data
      headers['content-type'] = 'application/json'
      ended = true
      return res
    },
    send(data) {
      body = data
      ended = true
      return res
    },
    end(data) {
      if (data !== undefined) body = data
      ended = true
      return res
    },
    get headersSent() {
      return ended
    },
  }
  return { res, getResult: () => ({ statusCode, headers, body }) }
}

function invokeHandler(handler, req, res) {
  return new Promise((resolve, reject) => {
    corsMiddleware(req, res, async () => {
      if (res.headersSent) {
        resolve()
        return
      }
      try {
        await handler(req, res)
        if (!res.headersSent) {
          res.status(500).json({ error: 'Resposta não enviada pelo servidor' })
        }
        resolve()
      } catch (err) {
        if (!res.headersSent) {
          res.status(500).json({ error: err?.message || 'Erro interno' })
        }
        reject(err)
      }
    })
  })
}

async function handleHttpRequest(handler, request) {
  let body = {}
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      body = await request.json().catch(() => ({}))
    }
  }
  const req = createMockReq(request, body)
  const { res, getResult } = createMockRes()
  await invokeHandler(handler, req, res)
  return getResult()
}

module.exports = { handleHttpRequest, createMockReq, createMockRes, invokeHandler }
