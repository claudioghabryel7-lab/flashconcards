export const previewExportContent = (flashcards) => {
  const content = flashcards.slice(0, 3).map((card, index) => {
    const front = card.pergunta?.replace(/\t/g, ' ') || ''
    const back = card.resposta?.replace(/\t/g, ' ') || ''
    const tags = `${card.materia || ''} ${card.modulo || ''}`.trim()
    
    return `${front}\t${back}\t${tags}`
  }).join('\n')
  
  console.log('📋 Exemplo do conteúdo do arquivo:')
  console.log(content)
  
  return content
}
