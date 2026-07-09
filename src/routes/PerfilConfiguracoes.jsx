import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { updateProfile } from 'firebase/auth'
import { Camera, Save } from 'lucide-react'
import { auth, db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import UserAvatar from '../components/UserAvatar'
import { readImageAsBase64 } from '../utils/imageBase64'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import { syncUserCommunityIdentity } from '../services/communityUserService'
import { invalidateCommunityAuthorCache } from '../hooks/useCommunityAuthors'
import toast from 'react-hot-toast'

export default function PerfilConfiguracoes() {
  const { user, profile } = useAuth()
  const fileRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    displayName: '',
    photoBase64: null,
    birthDate: '',
    phone: '',
    bio: '',
    oneYearGoal: '',
    shareTrilhaToFeed: true,
  })

  useEffect(() => {
    if (!profile) return
    setForm({
      displayName: profile.displayName || user?.email?.split('@')[0] || '',
      photoBase64: profile.photoBase64 || null,
      birthDate: profile.birthDate || '',
      phone: profile.phone || '',
      bio: profile.bio || '',
      oneYearGoal: profile.oneYearGoal || '',
      shareTrilhaToFeed: profile.shareTrilhaToFeed !== false,
    })
  }, [profile, user?.email])

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const base64 = await readImageAsBase64(file, 320)
      setForm((f) => ({ ...f, photoBase64: base64 }))
    } catch (err) {
      toast.error(err.message || 'Erro ao carregar foto.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSave = async () => {
    if (!user?.uid) return
    setSaving(true)
    try {
      const displayName = form.displayName.trim() || user.email?.split('@')[0] || 'Aluno'
      await setDoc(
        doc(db, 'users', user.uid),
        {
          displayName,
          photoBase64: form.photoBase64 || null,
          birthDate: form.birthDate || null,
          phone: form.phone.trim() || null,
          bio: form.bio.trim() || null,
          oneYearGoal: form.oneYearGoal.trim() || null,
          shareTrilhaToFeed: form.shareTrilhaToFeed,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName })
      }

      await syncUserCommunityIdentity(user.uid, {
        displayName,
        photoBase64: form.photoBase64 || null,
      })
      invalidateCommunityAuthorCache(user.uid)

      toast.success('Perfil salvo!')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar perfil.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <CPPageHeader
        badge="Conta"
        title="Meu perfil"
        subtitle="Foto, dados pessoais e preferências de privacidade na comunidade."
        backHref="/dashboard"
      />

      <div className="cp-card p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative">
            <UserAvatar photoBase64={form.photoBase64} name={form.displayName} size="lg" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-cp-border bg-cp-surface text-cp-text shadow-sm hover:bg-cp-accent/10"
              aria-label="Alterar foto"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>
          <div className="flex-1 space-y-3 text-center sm:text-left">
            <p className="text-sm text-cp-muted">Foto opcional — aparece no header e na comunidade.</p>
            {form.photoBase64 && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, photoBase64: null }))}
                className="text-xs text-cp-muted underline hover:text-cp-text"
              >
                Remover foto
              </button>
            )}
            <label className="block text-sm text-cp-muted">
              Nome de exibição
              <input
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="cp-card space-y-4 p-6">
        <h2 className="text-lg font-semibold text-cp-text">Informações pessoais</h2>
        <label className="block text-sm text-cp-muted">
          Data de nascimento
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
          />
        </label>
        <label className="block text-sm text-cp-muted">
          Telefone
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="(62) 99999-9999"
            className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
          />
        </label>
        <label className="block text-sm text-cp-muted">
          Descrição
          <textarea
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            rows={3}
            placeholder="Conte um pouco sobre você e seus estudos..."
            className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
          />
        </label>
        <label className="block text-sm text-cp-muted">
          Meta para daqui há 1 ano
          <textarea
            value={form.oneYearGoal}
            onChange={(e) => setForm((f) => ({ ...f, oneYearGoal: e.target.value }))}
            rows={2}
            placeholder="Ex.: Ser aprovado no concurso da PMGO"
            className="mt-1 w-full rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-cp-text outline-none"
          />
        </label>
      </div>

      <div className="cp-card space-y-3 p-6">
        <h2 className="text-lg font-semibold text-cp-text">Comunidade de estudos</h2>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={form.shareTrilhaToFeed}
            onChange={(e) => setForm((f) => ({ ...f, shareTrilhaToFeed: e.target.checked }))}
            className="mt-1 h-4 w-4 rounded border-cp-border text-cp-accent"
          />
          <span className="text-sm text-cp-muted">
            Publicar automaticamente meus registros da{' '}
            <Link to="/trilha" className="text-cp-accent underline">
              Trilha
            </Link>{' '}
            na mini rede social. Desmarque para manter seus estudos privados.
          </span>
        </label>
      </div>

      <button type="button" onClick={handleSave} disabled={saving} className="cp-btn-primary w-full">
        <Save className="h-4 w-4" />
        {saving ? 'Salvando...' : 'Salvar perfil'}
      </button>
    </div>
  )
}
