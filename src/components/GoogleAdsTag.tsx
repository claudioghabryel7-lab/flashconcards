'use client'

import Script from 'next/script'
import { GOOGLE_ADS_ID } from '@/utils/googleAds'

/**
 * Tag base do Google Ads (gtag.js).
 * A conversão de Compra NÃO fica aqui — só dispara em Payment após confirmação.
 */
export default function GoogleAdsTag() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GOOGLE_ADS_ID}');
        `}
      </Script>
    </>
  )
}
