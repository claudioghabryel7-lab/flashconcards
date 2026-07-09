import { useCallback, useEffect, useRef, useState } from 'react'

function pickMimeType(candidates) {
  if (typeof MediaRecorder === 'undefined') return ''
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Erro ao processar gravação.'))
    reader.readAsDataURL(blob)
  })
}

export function useInlineMediaRecorder() {
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const [recording, setRecording] = useState(false)
  const [recordingMode, setRecordingMode] = useState(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [previewStream, setPreviewStream] = useState(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setPreviewStream(null)
  }, [])

  useEffect(() => {
    if (!recording) return undefined
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [recording])

  useEffect(() => () => stopStream(), [stopStream])

  const startRecording = useCallback(
    async (mode = 'audio') => {
      if (recording) return null
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Seu navegador não suporta gravação de áudio/vídeo.')
      }

      const constraints =
        mode === 'video'
          ? { audio: true, video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } } }
          : { audio: true }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      setPreviewStream(stream)
      chunksRef.current = []

      const mimeType =
        mode === 'video'
          ? pickMimeType(['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'])
          : pickMimeType(['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'])

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder

      return new Promise((resolve, reject) => {
        recorder.ondataavailable = (e) => {
          if (e.data?.size > 0) chunksRef.current.push(e.data)
        }

        recorder.onerror = () => {
          stopStream()
          setRecording(false)
          setRecordingMode(null)
          setElapsedSec(0)
          reject(new Error('Erro durante a gravação.'))
        }

        recorder.onstop = async () => {
          try {
            const type = recorder.mimeType || (mode === 'video' ? 'video/webm' : 'audio/webm')
            const blob = new Blob(chunksRef.current, { type })
            if (blob.size > (mode === 'video' ? 700 * 1024 : 500 * 1024)) {
              reject(new Error(mode === 'video' ? 'Vídeo muito longo. Grave até ~15s.' : 'Áudio muito longo.'))
              return
            }
            const dataUrl = await blobToDataUrl(blob)
            resolve({ type: mode, dataUrl, mimeType: type })
          } catch (err) {
            reject(err)
          } finally {
            stopStream()
            setRecording(false)
            setRecordingMode(null)
            setElapsedSec(0)
          }
        }

        recorder.start(250)
        setRecording(true)
        setRecordingMode(mode)
        setElapsedSec(0)
      })
    },
    [recording, stopStream],
  )

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
  }, [])

  const cancelRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    chunksRef.current = []
    stopStream()
    setRecording(false)
    setRecordingMode(null)
    setElapsedSec(0)
  }, [stopStream])

  return {
    recording,
    recordingMode,
    elapsedSec,
    previewStream,
    startRecording,
    stopRecording,
    cancelRecording,
  }
}
