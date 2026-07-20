const REQUEST_TYPE = 'FCC_GOOGLE_AI_REQUEST'
const RESPONSE_TYPE = 'FCC_GOOGLE_AI_RESPONSE'
const READY_TYPE = 'FCC_GOOGLE_AI_READY'
const PING_TYPE = 'FCC_GOOGLE_AI_PING'

window.postMessage({ type: READY_TYPE, version: '0.1.0' }, window.location.origin)

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const message = event.data
  if (message?.type === PING_TYPE) {
    window.postMessage(
      { type: READY_TYPE, requestId: message.requestId, version: '0.1.0' },
      window.location.origin,
    )
    return
  }
  if (!message || message.type !== REQUEST_TYPE || !message.requestId) return

  chrome.runtime.sendMessage(
    {
      type: REQUEST_TYPE,
      requestId: message.requestId,
      prompt: String(message.prompt || ''),
    },
    (response) => {
      const runtimeError = chrome.runtime.lastError
      window.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId: message.requestId,
          ok: !runtimeError && response?.ok === true,
          result: response?.result || '',
          error: runtimeError?.message || response?.error || '',
        },
        window.location.origin,
      )
    },
  )
})
