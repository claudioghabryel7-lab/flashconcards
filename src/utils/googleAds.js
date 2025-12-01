// Função para rastrear conversões do Google Ads
// Rótulo de conversão configurado: WE1ACJ2NxMgbEIvjwJdC
export const trackGoogleAdsConversion = (conversionLabel = null, value = 99.90, transactionId = null) => {
  if (typeof window !== 'undefined' && window.gtag) {
    // Rótulo de conversão: AW-17766035851/WE1ACJ2NxMgbEIvjwJdC
    const label = conversionLabel || 'AW-17766035851/WE1ACJ2NxMgbEIvjwJdC';
    
    window.gtag('event', 'conversion', {
      'send_to': label,
      'value': value,
      'currency': 'BRL',
      'transaction_id': transactionId || Date.now().toString()
    });
    console.log('✅ Conversão rastreada no Google Ads', { label, value, transactionId });
  } else {
    console.warn('⚠️ Google Ads (gtag) não está disponível');
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


