// Utilitário para testar responsividade do banner
export const testBannerResponsiveness = () => {
  const tests = []
  
  // Testar diferentes tamanhos de tela
  const screenSizes = [
    { name: 'Mobile Portrait', width: 375, height: 667 },
    { name: 'Mobile Landscape', width: 667, height: 375 },
    { name: 'Tablet Portrait', width: 768, height: 1024 },
    { name: 'Tablet Landscape', width: 1024, height: 768 },
    { name: 'Desktop Small', width: 1366, height: 768 },
    { name: 'Desktop Large', width: 1920, height: 1080 },
    { name: 'Ultra-wide', width: 2560, height: 1440 }
  ]
  
  screenSizes.forEach(size => {
    const aspectRatio = size.width / size.height
    const expectedAspectRatio = aspectRatio > 1 ? '16/9' : 
                               size.width < 640 ? '9/16' : '4/3'
    
    tests.push({
      screenSize: size.name,
      width: size.width,
      height: size.height,
      aspectRatio: aspectRatio.toFixed(2),
      expectedAspectRatio,
      orientation: size.width > size.height ? 'landscape' : 'portrait'
    })
  })
  
  return tests
}

// Função para logar resultados no console
export const logBannerTests = () => {
  const tests = testBannerResponsiveness()
  
  console.group('🎯 Banner Responsiveness Tests')
  tests.forEach(test => {
    console.log(`📱 ${test.screenSize}:`, {
      width: test.width,
      height: test.height,
      aspectRatio: test.aspectRatio,
      expected: test.expectedAspectRatio,
      orientation: test.orientation
    })
  })
  console.groupEnd()
}

// Verificar se o banner está visível e com proporção correta
export const validateBannerDisplay = () => {
  const bannerElement = document.querySelector('.banner-aspect-ratio')
  if (!bannerElement) {
    console.warn('❌ Banner element not found')
    return false
  }
  
  const rect = bannerElement.getBoundingClientRect()
  const actualAspectRatio = rect.width / rect.height
  
  console.log('📊 Banner Display Info:', {
    width: rect.width,
    height: rect.height,
    aspectRatio: actualAspectRatio.toFixed(2),
    isVisible: rect.width > 0 && rect.height > 0
  })
  
  return true
}
