import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
} from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const AuthContext = createContext(null)

const defaultProfile = (firebaseUser) => ({
  uid: firebaseUser.uid,
  email: firebaseUser.email,
  displayName: firebaseUser.displayName || 'Aluno ALEGO',
  role: 'student',
  favorites: [],
})

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const upsertProfile = async (firebaseUser, extraData = {}) => {
    if (!firebaseUser) return null
    const userRef = doc(db, 'users', firebaseUser.uid)
    const snap = await getDoc(userRef)
    if (snap.exists()) {
      const data = { uid: firebaseUser.uid, ...snap.data() }
      setProfile(data)
      return data
    }
    const payload = {
      ...defaultProfile(firebaseUser),
      ...extraData,
      createdAt: serverTimestamp(),
    }
    await setDoc(userRef, payload)
    setProfile(payload)
    return payload
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        await upsertProfile(firebaseUser)
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const login = async (email, password) => {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    await upsertProfile(credential.user)
  }

  const register = async ({ email, password, name, cpf, birthDate }) => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    )
    if (name) {
      await updateProfile(credential.user, { displayName: name })
    }
    const sanitizedCpf = cpf?.replace(/\D/g, '')
    await upsertProfile(
      { ...credential.user, displayName: name },
      {
        displayName: name,
        cpf: sanitizedCpf,
        birthDate: birthDate || null,
      },
    )
  }

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    const credential = await signInWithPopup(auth, provider)
    await upsertProfile(credential.user)
  }

  const logout = async () => {
    await signOut(auth)
  }

  const updateFavorites = async (favorites = []) => {
    if (!user) return
    const userRef = doc(db, 'users', user.uid)
    await setDoc(userRef, { favorites }, { merge: true })
    setProfile((prev) => (prev ? { ...prev, favorites } : prev))
  }

  const value = {
    user,
    profile,
    isAdmin: profile?.role === 'admin',
    favorites: profile?.favorites || [],
    loading,
    login,
    loginWithGoogle,
    register,
    logout,
    updateFavorites,
  }

  return createElement(AuthContext.Provider, { value }, children)
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

