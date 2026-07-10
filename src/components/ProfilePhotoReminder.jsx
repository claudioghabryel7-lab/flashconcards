import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Camera, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const SESSION_DISMISS_KEY = 'profilePhotoReminderDismissedSession'

export default function ProfilePhotoReminder() {
  const { user, profile, isAdmin } = useAuth()
  const location = useLocation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!user || isAdmin) {
      setVisible(false)
      return
    }

    const hasPhoto = Boolean(profile?.photoBase64)
    if (hasPhoto) {
      sessionStorage.removeItem(SESSION_DISMISS_KEY)
      setVisible(false)
      return
    }

    const dismissed = sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'
    const onProfilePage = location.pathname === '/perfil' || location.pathname.startsWith('/perfil/')
    setVisible(!dismissed && !onProfilePage)
  }, [user, profile?.photoBase64, isAdmin, location.pathname])

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_DISMISS_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="Fechar aviso"
        onClick={handleDismiss}
      />
      <div
        role="dialog"
        aria-labelledby="profile-photo-reminder-title"
        className="relative w-full max-w-md animate-in fade-in zoom-in-95 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-2xl dark:border-amber-700 dark:from-amber-950 dark:to-orange-950"
      >
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-3 top-3 rounded-full p-1 text-amber-700 hover:bg-amber-200/60 dark:text-amber-200"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <h2 id="profile-photo-reminder-title" className="text-lg font-bold text-amber-950 dark:text-amber-50">
              Ei, ta na hora de atualizar seu perfil!
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
              Coloque uma foto para a comunidade te reconhecer. Leva menos de um minuto.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/perfil"
            onClick={handleDismiss}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Atualizar perfil agora
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex items-center justify-center rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-900/40"
          >
            Depois
          </button>
        </div>
      </div>
    </div>
  )
}
