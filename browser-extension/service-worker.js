const REQUEST_TYPE = 'FCC_GOOGLE_AI_REQUEST'
const GOOGLE_RUN_TYPE = 'FCC_GOOGLE_AI_RUN'
const GOOGLE_AI_URL = 'https://www.google.com/search?udm=50&hl=pt-BR'

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error('Tempo esgotado ao abrir o Modo IA do Google.'))
    }, timeoutMs)

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }

    chrome.tabs.onUpdated.addListener(listener)
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return
      if (tab?.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    })
  })
}

function sendToGoogleTab(tabId, prompt) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: GOOGLE_RUN_TYPE, prompt }, (response) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
        return
      }
      if (!response?.ok) {
        reject(new Error(response?.error || 'O Modo IA não retornou resposta.'))
        return
      }
      resolve(response.result || '')
    })
  })
}

async function runGoogleAi(prompt) {
  if (!prompt.trim()) throw new Error('Consulta vazia.')

  const tab = await chrome.tabs.create({ url: GOOGLE_AI_URL, active: false })
  if (!tab?.id) throw new Error('Não foi possível abrir a aba do Google.')

  try {
    await waitForTabComplete(tab.id)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return await sendToGoogleTab(tab.id, prompt)
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {})
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== REQUEST_TYPE) return false

  runGoogleAi(String(message.prompt || ''))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }))

  return true
})
