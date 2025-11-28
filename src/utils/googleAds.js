// Função para rastrear conversões do Google Ads
export const trackGoogleAdsConversion = (conversionLabel = null) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'conversion', {
      'send_to': conversionLabel || 'AW-17766035851/SEU_CONVERSION_LABEL',
      'value': 99.90,
      'currency': 'BRL',
      'transaction_id': Date.now().toString()
    });
    console.log('✅ Conversão rastreada no Google Ads');
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


