const MAX_VIDEO_BYTES = 700 * 1024
const MAX_AUDIO_BYTES = 500 * 1024

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

export async function readVideoAsBase64(file) {
  if (!file?.type?.startsWith('video/')) {
    throw new Error('Selecione um vídeo válido.')
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error('Vídeo muito grande. Use um clipe de até ~30 segundos.')
  }
  return readFileAsDataUrl(file)
}

export async function readAudioAsBase64(file) {
  if (!file?.type?.startsWith('audio/')) {
    throw new Error('Selecione um áudio válido.')
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new Error('Áudio muito grande. Use um arquivo menor.')
  }
  return readFileAsDataUrl(file)
}
