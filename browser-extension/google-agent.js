const GOOGLE_RUN_TYPE = 'FCC_GOOGLE_AI_RUN'
const DOSSIER_START = 'FCC_DOSSIER_START'
const DOSSIER_END = 'FCC_DOSSIER_END'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(getValue, timeoutMs, label) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = getValue()
    if (value) return value
    await sleep(500)
  }
  throw new Error(`Tempo esgotado: ${label}.`)
}

function findPromptInput() {
  const candidates = [
    ...document.querySelectorAll('textarea'),
    ...document.querySelectorAll('[contenteditable="true"][role="textbox"]'),
    ...document.querySelectorAll('[contenteditable="true"]'),
  ]
  return candidates.find((el) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 100 && rect.height > 20
  })
}

function setPromptValue(input, prompt) {
  input.focus()
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const prototype =
      input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    setter?.call(input, prompt)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return
  }

  input.textContent = ''
  document.execCommand('insertText', false, prompt)
  input.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: prompt,
    }),
  )
}

function submitPrompt(input) {
  const submit = [...document.querySelectorAll('button')].find((button) => {
    const label = `${button.getAttribute('aria-label') || ''} ${button.title || ''}`.toLowerCase()
    return (
      !button.disabled &&
      (label.includes('enviar') ||
        label.includes('submit') ||
        label.includes('send') ||
        label.includes('pesquisar'))
    )
  })

  if (submit) {
    submit.click()
    return
  }

  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    }),
  )
  input.dispatchEvent(
    new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    }),
  )
}

function pageText() {
  const main =
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.body
  return String(main?.innerText || '').trim()
}

function isGenerating() {
  return [...document.querySelectorAll('button')].some((button) => {
    const label = `${button.getAttribute('aria-label') || ''} ${button.title || ''}`.toLowerCase()
    return label.includes('parar') || label.includes('stop generating')
  })
}

function extractDossier(text) {
  const start = text.lastIndexOf(DOSSIER_START)
  const end = text.lastIndexOf(DOSSIER_END)
  if (start >= 0 && end > start) {
    return text.slice(start + DOSSIER_START.length, end).trim()
  }
  return text.slice(-30000).trim()
}

async function runPrompt(prompt) {
  const input = await waitFor(findPromptInput, 20000, 'campo de pergunta do Google')
  const before = pageText()
  setPromptValue(input, prompt)
  await sleep(300)
  submitPrompt(input)

  await waitFor(() => {
    const current = pageText()
    return current.length > before.length + 120 ? current : null
  }, 45000, 'início da resposta do Modo IA')

  let lastText = ''
  let stableSince = Date.now()
  const startedAt = Date.now()

  while (Date.now() - startedAt < 150000) {
    const current = pageText()
    if (current !== lastText) {
      lastText = current
      stableSince = Date.now()
    }
    if (!isGenerating() && Date.now() - stableSince >= 7000) break
    await sleep(1000)
  }

  const result = extractDossier(lastText)
  if (result.length < 120) throw new Error('Resposta do Modo IA vazia ou incompleta.')
  return result
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== GOOGLE_RUN_TYPE) return false

  runPrompt(String(message.prompt || ''))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }))

  return true
})
