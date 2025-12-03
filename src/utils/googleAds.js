// Função para rastrear conversões do Google Ads
// Rótulo de conversão configurado: WE1ACJ2NxMgbEIvjwJdC
export const trackGoogleAdsConversion = (conversionLabel = null, value = 99.90, transactionId = null) => {
  if (typeof window === 'undefined') {
    console.warn('⚠️ window não está disponível');
    return;
  }

  // Aguardar gtag estar disponível (pode levar alguns segundos para carregar)
  const sendConversion = () => {
    if (!window.gtag) {
      console.warn('⚠️ Google Ads (gtag) não está disponível ainda, tentando novamente...');
      // Tentar novamente após 500ms
      setTimeout(sendConversion, 500);
      return;
    }

    // Rótulo de conversão: AW-17766035851/WE1ACJ2NxMgbEIvjwJdC
    const label = conversionLabel || 'AW-17766035851/WE1ACJ2NxMgbEIvjwJdC';
    
    // Garantir que o valor é um número
    const conversionValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    
    // Garantir que transaction_id é uma string única
    const txId = transactionId ? String(transactionId) : `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      window.gtag('event', 'conversion', {
        'send_to': label,
        'value': conversionValue,
        'currency': 'BRL',
        'transaction_id': txId
      });
      
      console.log('✅ Conversão rastreada no Google Ads', { 
        label, 
        value: conversionValue, 
        transactionId: txId,
        timestamp: new Date().toISOString()
      });
      
      // Também logar no dataLayer para debug
      if (window.dataLayer) {
        console.log('📊 DataLayer atual:', window.dataLayer.slice(-3));
      }
    } catch (error) {
      console.error('❌ Erro ao rastrear conversão no Google Ads:', error);
    }
  };

  // Verificar se gtag já está disponível
  if (window.gtag && typeof window.gtag === 'function') {
    sendConversion();
  } else {
    // Aguardar até 5 segundos para gtag carregar
    let attempts = 0;
    const maxAttempts = 10; // 5 segundos total (10 x 500ms)
    
    const checkGtag = setInterval(() => {
      attempts++;
      if (window.gtag && typeof window.gtag === 'function') {
        clearInterval(checkGtag);
        sendConversion();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkGtag);
        console.error('❌ Google Ads (gtag) não carregou após 5 segundos. Verifique se a tag está no index.html');
      }
    }, 500);
  }
};

// Função para rastrear clique no botão (antes de redirecionar)
export const trackButtonClick = () => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'click', {
      'event_category': 'engagement',
      'event_label': 'Garantir Promoção',
      'value': 99.90
    });
    console.log('✅ Clique rastreado no Google Ads');
  }
};


