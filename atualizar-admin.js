// Script para atualizar seu perfil para admin
// Execute: node atualizar-admin.js

import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDHuH7tvuMif73sanKFQHByN9AfVE8huBU",
  authDomain: "plegi-d84c2.firebaseapp.com",
  projectId: "plegi-d84c2",
  storageBucket: "plegi-d84c2.firebasestorage.app",
  messagingSenderId: "491249996726",
  appId: "1:491249996726:web:77e1b3224efa27e3812717",
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// IMPORTANTE: Substitua 'SEU_UID_AQUI' pelo UID do seu usuário no Firebase Authentication
// Para encontrar: Firebase Console → Authentication → Users → copie o UID
const SEU_UID = 'SEU_UID_AQUI' // ← SUBSTITUA AQUI

async function atualizarAdmin() {
  try {
    const userRef = doc(db, 'users', SEU_UID)
    const snap = await getDoc(userRef)
    
    if (snap.exists()) {
      const data = snap.data()
      await setDoc(userRef, {
        ...data,
        role: 'admin',
      }, { merge: true })
      console.log('✅ Perfil atualizado para admin!')
    } else {
      console.log('❌ Usuário não encontrado. Verifique o UID.')
    }
  } catch (err) {
    console.error('Erro:', err)
  }
}

atualizarAdmin()









