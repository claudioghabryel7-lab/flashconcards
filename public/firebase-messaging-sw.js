// Firebase Cloud Messaging — background push (PWA / Android Chrome / desktop)
// Deve ficar na raiz pública para o getToken do FCM.

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyDHuH7tvuMif73sanKFQHByN9AfVE8huBU',
  authDomain: 'plegi-d84c2.firebaseapp.com',
  projectId: 'plegi-d84c2',
  storageBucket: 'plegi-d84c2.firebasestorage.app',
  messagingSenderId: '491249996726',
  appId: '1:491249996726:web:77e1b3224efa27e3812717',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || 'FlashConCards'
  const body =
    payload?.notification?.body || payload?.data?.body || 'Você tem uma novidade nos estudos.'
  const link = payload?.data?.link || payload?.fcmOptions?.link || '/dashboard'
  const icon = payload?.notification?.icon || '/favicon-192x192.png'

  self.registration.showNotification(title, {
    body,
    icon,
    badge: '/favicon-96x96.png',
    data: { link },
    tag: payload?.data?.tag || 'flashconcards-push',
    renotify: true,
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = event.notification?.data?.link || '/dashboard'
  const url = new URL(link, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
      return undefined
    }),
  )
})
