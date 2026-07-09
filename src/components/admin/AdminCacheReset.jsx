import { useCallback, useEffect, useState } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../../firebase/config'
import { readPlatformCacheVersion } from '../../hooks/useSiteCacheSync'
import {
  SITE_CACHE_VERSION_KEY,
  clearClientCaches,
  hardReloadSite,
} from '../../utils/siteCacheSync'

export default function AdminCacheReset() {
  const [resetting, setResetting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [lastReset, setLastReset] = useState(null)

  const refreshLastReset = useCallback(async () => {
    const version = await readPlatformCacheVersion()
    if (version) {
      setLastReset({
        version,
        at: new Date(version),
      })
    }
  }, [])

  useEffect(() => {
    refreshLastReset()
  }, [refreshLastReset])

  const handleForceRefresh = async () => {
    setFeedback('')
    const confirmed = window.confirm(
      'Isso vai forçar TODOS os usuários (incluindo você) a recarregar o site e limpar cache antigo.\n\nUse após publicar atualizações importantes.\n\nContinuar?',
    )
    if (!confirmed) return

    setResetting(true)
    try {
      const version = Date.now()
      await setDoc(
        doc(db, 'siteSettings', 'platform'),
        {
          cacheVersion: version,
          cacheUpdatedAt: serverTimestamp(),
          cacheUpdatedBy: auth?.currentUser?.uid || null,
        },
        { merge: true },
      )

      localStorage.setItem(SITE_CACHE_VERSION_KEY, String(version))
      setLastReset({ version, at: new Date(version) })
      await clearClientCaches()

      setFeedback('✅ Atualização disparada! Recarregando em instantes…')
      setTimeout(() => hardReloadSite(), 900)
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao forçar atualização.'}`)
      setResetting(false)
    }
  }

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-lg dark:border-amber-800 dark:from-amber-900/20 dark:to-orange-900/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
            <ArrowPathIcon className="h-5 w-5" />
            Forçar atualização do site (todos os usuários)
          </p>
          <p className="max-w-2xl text-xs text-amber-900/80 dark:text-amber-200/80">
            Use depois de publicar mudanças importantes. Todos os usuários conectados vão limpar cache
            antigo e recarregar a versão mais recente automaticamente.
          </p>
          {lastReset?.at && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Último reset: {lastReset.at.toLocaleString('pt-BR')}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleForceRefresh}
          disabled={resetting}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:from-amber-600 hover:to-orange-700 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-5 w-5 ${resetting ? 'animate-spin' : ''}`} />
          {resetting ? 'Disparando…' : 'Resetar cache do site'}
        </button>
      </div>

      {feedback && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            feedback.startsWith('✅')
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-rose-100 text-rose-800'
          }`}
        >
          {feedback}
        </p>
      )}
    </div>
  )
}
