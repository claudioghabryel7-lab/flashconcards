import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Observar mudanças no estado de autenticação do Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Usuário autenticado pelo Firebase
          const userObj = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email,
          }
          setUser(userObj)

          // Carregar perfil do Firestore
          const userRef = doc(db, 'users', firebaseUser.uid)
          const isAdminEmail = firebaseUser.email?.toLowerCase() === 'claudioghabryel.cg@gmail.com'
          
          try {
            const snap = await getDoc(userRef)
            
            if (snap.exists()) {
              const data = { uid: firebaseUser.uid, email: firebaseUser.email, ...snap.data() }
              
              // Se for o email do admin mas não tiver role admin, atualizar automaticamente
              if (isAdminEmail && data.role !== 'admin') {
                try {
                  await setDoc(userRef, { 
                    role: 'admin',
                  }, { merge: true })
                  data.role = 'admin'
                } catch (err) {
                  console.error('Erro ao atualizar role:', err)
                  // Mesmo com erro, definir como admin localmente
                  data.role = 'admin'
                }
              }
              
              // Garantir que role não seja undefined
              if (!data.role && isAdminEmail) {
                data.role = 'admin'
              } else if (!data.role) {
                data.role = 'student'
              }
              
              setProfile(data)
            } else {
              // Criar perfil se não existir
              const newProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName || firebaseUser.email,
                role: isAdminEmail ? 'admin' : 'student',
                favorites: [],
                createdAt: serverTimestamp(),
              }
              try {
                await setDoc(userRef, newProfile)
                setProfile(newProfile)
              } catch (err) {
                console.error('Erro ao criar perfil:', err)
                // Mesmo com erro, definir perfil localmente
                setProfile(newProfile)
              }
            }
          } catch (err) {
            console.error('Erro ao carregar perfil:', err)
            // Em caso de erro, criar perfil localmente
            const fallbackProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || firebaseUser.email,
              role: isAdminEmail ? 'admin' : 'student',
              favorites: [],
            }
            setProfile(fallbackProfile)
          }
        } else {
          setUser(null)
          setProfile(null)
        }
      } catch (err) {
        console.error('Erro no onAuthStateChanged:', err)
        setUser(null)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  // Sincronizar perfil em tempo real
  useEffect(() => {
    if (!user) {
      setProfile(null)
      return () => {}
    }
    
    const userRef = doc(db, 'users', user.uid)
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        let data = { uid: user.uid, email: user.email, ...snap.data() }
        
        // Se for o email do admin, garantir que role seja admin
        const isAdminEmail = user.email?.toLowerCase() === 'claudioghabryel.cg@gmail.com'
        if (isAdminEmail) {
          // Se role não for admin, atualizar
          if (data.role !== 'admin') {
            // Atualizar localmente primeiro
            data.role = 'admin'
            // Atualizar no Firestore (sem await para não bloquear)
            setDoc(userRef, { role: 'admin' }, { merge: true }).catch(err => {
              console.error('Erro ao atualizar role no Firestore:', err)
            })
          }
        }
        
        // Garantir que role não seja undefined
        if (!data.role) {
          data.role = isAdminEmail ? 'admin' : 'student'
        }
        
        setProfile(data)
      } else {
        setProfile(null)
      }
    }, (error) => {
      console.error('Erro no onSnapshot do perfil:', error)
      // Não resetar profile em caso de erro para evitar flicker
    })
    
    return () => unsub()
  }, [user])

  const login = async (email, password) => {
    try {
      const emailLower = email.toLowerCase().trim()
      const userCredential = await signInWithEmailAndPassword(auth, emailLower, password)
      // O estado será atualizado automaticamente pelo onAuthStateChanged
      return userCredential.user
    } catch (err) {
      console.error('Erro no login:', err)
      if (err.code === 'auth/user-not-found') {
        throw new Error('Usuário não encontrado.')
      } else if (err.code === 'auth/wrong-password') {
        throw new Error('Senha incorreta.')
      } else if (err.code === 'auth/invalid-email') {
        throw new Error('Email inválido.')
      } else if (err.code === 'auth/api-key-not-valid' || err.message?.includes('api-key')) {
        throw new Error('API key do Firebase não configurada. Verifique o arquivo .env com as variáveis VITE_FIREBASE_*')
      } else if (err.code === 'auth/network-request-failed') {
        throw new Error('Erro de conexão. Verifique sua internet.')
      } else {
        throw new Error(err.message || 'Erro ao fazer login.')
      }
    }
  }

  const register = async (email, password, displayName = null) => {
    try {
      const emailLower = email.toLowerCase().trim()
      const userCredential = await createUserWithEmailAndPassword(auth, emailLower, password)
      
      // Atualizar displayName se fornecido
      if (displayName) {
        await updateProfile(userCredential.user, { displayName })
      }

      // Criar perfil no Firestore
      const userRef = doc(db, 'users', userCredential.user.uid)
      await setDoc(userRef, {
        uid: userCredential.user.uid,
        email: emailLower,
        displayName: displayName || emailLower,
        role: 'student',
        favorites: [],
        createdAt: serverTimestamp(),
      })

      return userCredential.user
    } catch (err) {
      console.error('Erro no registro:', err)
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('Este email já está cadastrado.')
      } else if (err.code === 'auth/weak-password') {
        throw new Error('Senha muito fraca. Use pelo menos 6 caracteres.')
      } else if (err.code === 'auth/invalid-email') {
        throw new Error('Email inválido.')
      } else {
        throw new Error(err.message || 'Erro ao criar conta.')
      }
    }
  }

  const logout = async () => {
    try {
      await signOut(auth)
      // O estado será atualizado automaticamente pelo onAuthStateChanged
    } catch (err) {
      console.error('Erro no logout:', err)
      throw err
    }
  }

  const updateFavorites = async (favorites = []) => {
    if (!user) return
    try {
      const userRef = doc(db, 'users', user.uid)
      await setDoc(userRef, { favorites, updatedAt: serverTimestamp() }, { merge: true })
      setProfile((prev) => (prev ? { ...prev, favorites } : prev))
    } catch (err) {
      console.error('Erro ao atualizar favoritos:', err)
      throw err
    }
  }

  // Calcular isAdmin com verificação extra
  const isAdmin = useMemo(() => {
    const role = profile?.role
    const email = user?.email?.toLowerCase()
    const isAdminEmail = email === 'claudioghabryel.cg@gmail.com'
    
    // Se for o email do admin, sempre considerar admin
    if (isAdminEmail) {
      return true
    }
    
    return role === 'admin'
  }, [profile?.role, user?.email])

  const value = {
    user,
    profile,
    isAdmin,
    favorites: profile?.favorites || [],
    loading,
    login,
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
