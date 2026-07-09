let pdfjsPromise = null

export async function loadPdfjs() {
  if (typeof window === 'undefined') return null

  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      const pdfjsLib = mod.default || mod
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
      }
      return pdfjsLib
    })
  }

  return pdfjsPromise
}
