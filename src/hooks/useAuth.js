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
import { auth, db, firebaseInitialized } from '../firebase/config'

const AuthContext = createContext(null)

// Cache para perfil do usuário (TTL: 2 minutos)
const PROFILE_CACHE_KEY = 'auth_profile_cache'
const PROFILE_CACHE_TTL = 2 * 60 * 1000 // 2 minutos

const getCachedProfile = (uid) => {
  try {
    const cached = localStorage.getItem(`${PROFILE_CACHE_KEY}_${uid}`)
    if (!cached) return null
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp < PROFILE_CACHE_TTL) {
      return data
    }
    localStorage.removeItem(`${PROFILE_CACHE_KEY}_${uid}`)
    return null
  } catch {
    return null
  }
}

const setCachedProfile = (uid, profile) => {
  try {
    localStorage.setItem(`${PROFILE_CACHE_KEY}_${uid}`, JSON.stringify({
      data: profile,
      timestamp: Date.now()
    }))
  } catch {
    // Ignorar erros de localStorage
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Observar mudanças no estado de autenticação do Firebase
  useEffect(() => {
    // Se Firebase não foi inicializado, apenas marcar como não carregando
    if (!firebaseInitialized || !auth || !db) {
      setLoading(false)
      return
    }

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

          // Tentar carregar do cache primeiro para melhor TTFB
          const cachedProfile = getCachedProfile(firebaseUser.uid)
          if (cachedProfile) {
            setProfile(cachedProfile)
            setLoading(false) // Não bloquear renderização se tiver cache
          }

          // Carregar perfil do Firestore (não bloquear renderização)
          const userRef = doc(db, 'users', firebaseUser.uid)
          
          // Verificar se é email do admin
          const isAdminEmail = firebaseUser.email?.toLowerCase() === 'claudioghabryel.cg@gmail.com'
          
          try {
            const snap = await getDoc(userRef)
            
            if (snap.exists()) {
              const data = { uid: firebaseUser.uid, email: firebaseUser.email, ...snap.data() }
              
              // Verificar se o usuário foi deletado
              if (data.deleted === true) {
                // Usuário foi removido pelo admin - fazer logout imediato
                if (import.meta.env.DEV) {
                  console.log('Usuário foi removido do sistema. Fazendo logout...')
                }
                try {
                  await signOut(auth)
                  setUser(null)
                  setProfile(null)
                  return
                } catch (err) {
                  if (import.meta.env.DEV) {
                    console.error('Erro ao fazer logout:', err)
                  }
                  setUser(null)
                  setProfile(null)
                  return
                }
              }
              
              // Garantir que role não seja undefined
              if (!data.role) {
                data.role = isAdminEmail ? 'admin' : 'student'
              }
              
              setProfile(data)
              setCachedProfile(firebaseUser.uid, data) // Salvar no cache
            } else {
              // Verificar se o usuário foi deletado antes de recriar
              const deletedUserRef = doc(db, 'deletedUsers', firebaseUser.uid)
              const deletedSnap = await getDoc(deletedUserRef)
              
              if (deletedSnap.exists()) {
                // Usuário foi deletado pelo admin - fazer logout e não recriar
                console.log('Usuário foi removido do sistema. Acesso negado.')
                try {
                  await signOut(auth)
                  setUser(null)
                  setProfile(null)
                  return
                } catch (err) {
                  console.error('Erro ao fazer logout:', err)
                  setUser(null)
                  setProfile(null)
                  return
                }
              }
              
              // Criar perfil se não existir e não foi deletado
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
                setCachedProfile(firebaseUser.uid, newProfile) // Salvar no cache
              } catch (err) {
                console.error('Erro ao criar perfil:', err)
                // Mesmo com erro, definir perfil localmente
                setProfile(newProfile)
                setCachedProfile(firebaseUser.uid, newProfile) // Salvar no cache mesmo com erro
              }
            }
          } catch (err) {
            console.error('Erro ao carregar perfil:', err)
            // Em caso de erro, criar perfil localmente
            const isAdminEmailFallback = firebaseUser.email?.toLowerCase() === 'claudioghabryel.cg@gmail.com'
            const fallbackProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || firebaseUser.email,
              role: isAdminEmailFallback ? 'admin' : 'student',
              favorites: [],
            }
            setProfile(fallbackProfile)
            setCachedProfile(firebaseUser.uid, fallbackProfile) // Salvar no cache
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
    if (!user || !firebaseInitialized || !db) {
      if (!user) setProfile(null)
      return () => {}
    }
    
    const userRef = doc(db, 'users', user.uid)
    const unsub = onSnapshot(
      userRef, 
      async (snap) => {
        if (snap.exists()) {
          let data = { uid: user.uid, email: user.email, ...snap.data() }
          
          // Verificar se o usuário foi deletado
          if (data.deleted === true) {
            // Usuário foi removido pelo admin - fazer logout imediato
            console.log('Usuário foi removido do sistema. Fazendo logout...')
            try {
              await signOut(auth)
              setUser(null)
              setProfile(null)
              return
            } catch (err) {
              console.error('Erro ao fazer logout:', err)
              // Mesmo com erro, limpar estado local
              setUser(null)
              setProfile(null)
              return
            }
          }
          
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
          setCachedProfile(user.uid, data) // Atualizar cache
        } else {
          // Perfil não existe - verificar se foi deletado antes de fazer logout
          const deletedUserRef = doc(db, 'deletedUsers', user.uid)
          const deletedSnap = await getDoc(deletedUserRef)
          
          if (deletedSnap.exists()) {
            // Usuário foi deletado pelo admin - fazer logout
            console.log('Usuário foi removido do sistema. Fazendo logout...')
          try {
            await signOut(auth)
            setUser(null)
            setProfile(null)
          } catch (err) {
            console.error('Erro ao fazer logout:', err)
            setUser(null)
              setProfile(null)
            }
          } else {
            // Perfil não existe mas não foi deletado - pode ser um usuário novo
            // Não fazer logout, apenas limpar profile (o onAuthStateChanged vai recriar se necessário)
            console.log('Perfil não encontrado, mas usuário não foi deletado. Aguardando recriação...')
            setProfile(null)
          }
        }
      },
      (error) => {
        // Tratar erro de permissão silenciosamente se for permission-denied
        if (error.code === 'permission-denied') {
          console.warn('Permissão negada ao ler perfil do usuário. Isso é normal se o usuário não estiver completamente autenticado.')
          // Não resetar profile em caso de erro de permissão para evitar flicker
          return
        }
        console.error('Erro no onSnapshot do perfil:', error)
        // Não resetar profile em caso de erro para evitar flicker
      }
    )
    
    return () => unsub()
  }, [user])

  const login = async (email, password) => {
    if (!firebaseInitialized || !auth || !db) {
      throw new Error('Firebase não está configurado. Verifique as variáveis de ambiente VITE_FIREBASE_*.')
    }
    try {
      const emailLower = email.toLowerCase().trim()
      const userCredential = await signInWithEmailAndPassword(auth, emailLower, password)
      
      // Verificar se o usuário foi deletado ANTES de permitir login
      const deletedUserRef = doc(db, 'deletedUsers', userCredential.user.uid)
      const deletedSnap = await getDoc(deletedUserRef)
      
      if (deletedSnap.exists()) {
        // Usuário foi deletado - fazer logout imediato
        console.log('Usuário foi removido do sistema. Acesso negado.')
        await signOut(auth)
        throw new Error('Este usuário foi removido do sistema. Entre em contato com o administrador.')
      }
      
      // O estado será atualizado automaticamente pelo onAuthStateChanged
      return userCredential.user
    } catch (err) {
      console.error('Erro no login:', err)
      if (err.message?.includes('removido do sistema')) {
        throw err // Re-throw a mensagem de usuário deletado
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        throw new Error('Aluno não encontrado no sistema.')
      } else if (err.code === 'auth/wrong-password') {
        throw new Error('Aluno não encontrado no sistema.')
      } else if (err.code === 'auth/invalid-email') {
        throw new Error('Email inválido.')
      } else if (err.code === 'auth/api-key-not-valid' || err.message?.includes('api-key')) {
        throw new Error('API key do Firebase não configurada. Verifique o arquivo .env com as variáveis VITE_FIREBASE_*')
      } else if (err.code === 'auth/network-request-failed') {
        throw new Error('Erro de conexão. Verifique sua internet.')
      } else {
        throw new Error('Aluno não encontrado no sistema.')
      }
    }
  }

  const register = async (email, password, displayName = null) => {
    if (!firebaseInitialized || !auth || !db) {
      throw new Error('Firebase não está configurado. Verifique as variáveis de ambiente VITE_FIREBASE_*.')
    }
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
    if (!firebaseInitialized || !auth) {
      setUser(null)
      setProfile(null)
      return
    }
    try {
      await signOut(auth)
      // O estado será atualizado automaticamente pelo onAuthStateChanged
    } catch (err) {
      console.error('Erro no logout:', err)
      throw err
    }
  }

  const updateFavorites = async (favorites = []) => {
    if (!user || !firebaseInitialized || !db) return
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
