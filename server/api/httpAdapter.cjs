/**
 * Adapta handlers estilo Express (req/res) para fetch Request / Response do Next.js.
 */

function buildReq(request, body) {
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
    body,
    query: Object.fromEntries(url.searchParams.entries()),
  }
}

function createRes() {
  let statusCode = 200
  const headers = {}
  let jsonBody = null
  let textBody = null
  let ended = false

  const res = {
    status(code) {
      statusCode = code
      return res
    },
    setHeader(key, value) {
      headers[key] = value
      return res
    },
    json(data) {
      jsonBody = data
      headers['content-type'] = 'application/json; charset=utf-8'
      ended = true
      return res
    },
    send(data) {
      textBody = data == null ? '' : String(data)
      ended = true
      return res
    },
    end() {
      ended = true
      return res
    },
  }

  return {
    res,
    toResponse() {
      if (jsonBody !== null) {
        return Response.json(jsonBody, { status: statusCode, headers })
      }
      return new Response(textBody || '', { status: statusCode, headers })
    },
    ended: () => ended,
  }
}

async function runHandler(handler, request, deps) {
  require('../../functions/firebaseAdmin.js').ensureInitialized()
  require('./initBackend.cjs')

  let body = {}
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await request.json()
    } catch {
      body = {}
    }
  }

  const req = buildReq(request, body)
  const { res, toResponse, ended } = createRes()

  await handler(req, res, deps)

  if (!ended()) {
    res.status(200).json({ ok: true })
  }

  return toResponse()
}

module.exports = { runHandler, buildReq, createRes }
