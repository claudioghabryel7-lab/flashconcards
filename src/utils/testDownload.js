export const testDownload = () => {
  try {
    console.log('🧪 Testando download...')
    
    // Criar conteúdo de teste
    const testContent = 'Teste de download\nLinha 2\nLinha 3'
    const blob = new Blob([testContent], { type: 'text/plain;charset=utf-8' })
    
    // Função de download
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'teste_download.txt'
    link.style.display = 'none'
    
    document.body.appendChild(link)
    link.click()
    
    setTimeout(() => {
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 100)
    
    console.log('✅ Teste de download concluído!')
  } catch (error) {
    console.error('❌ Erro no teste de download:', error)
  }
}
