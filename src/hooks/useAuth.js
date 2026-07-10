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
  reload,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, firebaseInitialized, initFirebase } from '../firebase/config'
import { isDevEnv } from '../lib/env.js'

const AuthContext = createContext(null)

// Cache para perfil do usuário (TTL: 24 horas para melhor persistência)
const PROFILE_CACHE_KEY = 'auth_profile_cache'
const PROFILE_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 horas

function normalizeProfileData(data, firebaseUser) {
  const isAdminEmail = firebaseUser.email?.toLowerCase() === 'claudioghabryel.cg@gmail.com'
  const role = data.role || (isAdminEmail ? 'admin' : 'student')
  const emailVerified =
    role === 'admin' || isAdminEmail
      ? true
      : data.emailVerified === true || firebaseUser.emailVerified === true
  return { ...data, role, emailVerified }
}

const getCachedProfile = (uid) => {
  try {
    const cached = localStorage.getItem(`${PROFILE_CACHE_KEY}_${uid}`)
    if (!cached) return null
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp < PROFILE_CACHE_TTL) {
      return data
    }
    // Em desenvolvimento, não limpar cache tão rápido para evitar logout frequente
    if (isDevEnv()) {
      console.log('Cache expirado, mas mantendo em desenvolvimento para evitar logout')
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
    initFirebase()
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
          }

          // Não bloquear a UI esperando o Firestore (evita "Carregando..." infinito)
          setLoading(false)

          // Carregar perfil do Firestore em background
          const userRef = doc(db, 'users', firebaseUser.uid)
          
          // Verificar se é email do admin
          const isAdminEmail = firebaseUser.email?.toLowerCase() === 'claudioghabryel.cg@gmail.com'
          
          try {
            const snap = await getDoc(userRef)
            
            if (snap.exists()) {
              const data = normalizeProfileData(
                { uid: firebaseUser.uid, email: firebaseUser.email, ...snap.data() },
                firebaseUser,
              )
              
              // Verificar se o usuário foi deletado
              if (data.deleted === true) {
                // Usuário foi removido pelo admin - fazer logout imediato
                if (isDevEnv()) {
                  console.log('Usuário foi removido do sistema. Fazendo logout...')
                }
                try {
                  await signOut(auth)
                  setUser(null)
                  setProfile(null)
                  return
                } catch (err) {
                  if (isDevEnv()) {
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
              setCachedProfile(firebaseUser.uid, data)
              setDoc(userRef, { lastAccessAt: serverTimestamp() }, { merge: true }).catch(() => {})
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
              const newProfile = normalizeProfileData(
                {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email,
                  displayName: firebaseUser.displayName || firebaseUser.email,
                  role: isAdminEmail ? 'admin' : 'student',
                  favorites: [],
                  emailVerified: isAdminEmail,
                  createdAt: serverTimestamp(),
                },
                firebaseUser,
              )
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
          const fbUser = auth?.currentUser
          let data = normalizeProfileData(
            { uid: user.uid, email: user.email, ...snap.data() },
            fbUser || { email: user.email },
          )
          
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
          try {
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
              // Em desenvolvimento, manter perfil do cache para evitar logout
              if (isDevEnv()) {
                const cachedProfile = getCachedProfile(user.uid)
                if (cachedProfile) {
                  console.log('Mantendo perfil do cache em desenvolvimento')
                  setProfile(cachedProfile)
                  return
                }
              }
              setProfile(null)
            }
          } catch (deletedCheckError) {
            // Se der erro de permissão ao verificar deletedUsers, apenas logar perfil como null
            // Não bloquear o usuário por problemas de permissão
            if (deletedCheckError.code !== 'permission-denied') {
              console.error('Erro ao verificar deletedUsers:', deletedCheckError)
            }
            // Perfil não encontrado - pode ser usuário novo ou erro de permissão
            setProfile(null)
          }
        }
      },
      (error) => {
        // Tratar erro de permissão silenciosamente se for permission-denied
        if (error.code === 'permission-denied') {
          console.warn('Permissão negada ao ler perfil do usuário. Isso é normal se o usuário não estiver completamente autenticado.')
          // Em desenvolvimento, não resetar profile para evitar logout frequente
          if (isDevEnv()) {
            console.log('Mantendo perfil atual em desenvolvimento (erro de permissão)')
            return
          }
          // Não resetar profile em caso de erro de permissão para evitar flicker
          return
        }
        console.error('Erro no onSnapshot do perfil:', error)
        // Em desenvolvimento, não resetar profile para evitar logout frequente
        if (isDevEnv()) {
          console.log('Mantendo perfil atual em desenvolvimento (erro geral)')
          return
        }
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
      const emailLower = (email || '').toLowerCase().trim()
      if (!emailLower) throw new Error('Email inválido.')
      const userCredential = await signInWithEmailAndPassword(auth, emailLower, password)
      
      // Verificar se o usuário foi deletado ANTES de permitir login
      try {
        const deletedUserRef = doc(db, 'deletedUsers', userCredential.user.uid)
        const deletedSnap = await getDoc(deletedUserRef)
        
        if (deletedSnap.exists()) {
          // Usuário foi deletado - fazer logout imediato
          console.log('Usuário foi removido do sistema. Acesso negado.')
          await signOut(auth)
          throw new Error('Este usuário foi removido do sistema. Entre em contato com o administrador.')
        }
      } catch (deletedCheckError) {
        // Se der erro de permissão, continuar normalmente (pode ser problema de regras)
        // O onSnapshot vai verificar depois
        if (deletedCheckError.code !== 'permission-denied') {
          console.warn('Erro ao verificar deletedUsers:', deletedCheckError)
        }
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
      const emailLower = (email || '').toLowerCase().trim()
      if (!emailLower) throw new Error('Email inválido.')
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
        emailVerified: false,
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

  const isEmailVerified = useMemo(() => {
    if (isAdmin) return true
    return profile?.emailVerified === true
  }, [isAdmin, profile?.emailVerified])

  const refreshProfile = async () => {
    if (!auth?.currentUser || !db) return null
    try {
      await reload(auth.currentUser)
      const userRef = doc(db, 'users', auth.currentUser.uid)
      const snap = await getDoc(userRef)
      if (snap.exists()) {
        const data = normalizeProfileData(
          { uid: auth.currentUser.uid, email: auth.currentUser.email, ...snap.data() },
          auth.currentUser,
        )
        setProfile(data)
        setCachedProfile(auth.currentUser.uid, data)
        return data
      }
    } catch (err) {
      console.error('Erro ao atualizar perfil:', err)
    }
    return null
  }

  const value = {
    user,
    profile,
    isAdmin,
    isEmailVerified,
    favorites: profile?.favorites || [],
    loading,
    login,
    register,
    logout,
    updateFavorites,
    refreshProfile,
  }

  return createElement(AuthContext.Provider, { value }, children)
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
