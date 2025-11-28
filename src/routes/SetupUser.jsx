import { useState } from 'react'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import CryptoJS from 'crypto-js'
import { db } from '../firebase/config'

const hashPassword = (password) => {
  return CryptoJS.SHA256(password).toString()
}

const SetupUser = () => {
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const createUser = async () => {
    try {
      const email = 'claudioghabryel.cg@gmail.com'
      const password = 'Gabriel@123'
      const emailLower = email.toLowerCase().trim()
      
      const passwordHash = hashPassword(password)
      
      const userRef = doc(db, 'users', emailLower)
      
      await setDoc(userRef, {
        email: emailLower,
        displayName: 'Claudio Ghabryel',
        passwordHash,
        role: 'admin',
        favorites: [],
        createdAt: serverTimestamp(),
      })
      
      setDone(true)
    } catch (err) {
      setError(err.message)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm text-center">
        <h2 className="text-2xl font-bold text-emerald-600">✅ Usuário criado!</h2>
        <p className="mt-4 text-sm text-slate-600">
          Email: claudioghabryel.cg@gmail.com
          <br />
          Senha: Gabriel@123
          <br />
          Tipo: Admin
        </p>
        <a
          href="/login"
          className="mt-6 inline-block rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white"
        >
          Ir para login
        </a>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm text-center">
      <h2 className="text-2xl font-bold text-alego-700">Criar usuário admin</h2>
      {error && (
        <p className="mt-4 rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={createUser}
        className="mt-6 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white"
      >
        Criar usuário
      </button>
    </div>
  )
}

export default SetupUser







