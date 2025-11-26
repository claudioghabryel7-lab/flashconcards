import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  doc,
} from 'firebase/firestore'
import { TrophyIcon, BookOpenIcon } from '@heroicons/react/24/solid'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import ProgressCalendar from '../components/ProgressCalendar'
import AIChat from '../components/AIChat'

const Dashboard = () => {
  const { user, profile } = useAuth()
  const [progressDates, setProgressDates] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return () => {}
    const progressRef = collection(db, 'progress')
    const q = query(
      progressRef,
      where('uid', '==', user.uid),
      orderBy('date', 'desc'),
    )
    const unsub = onSnapshot(q, (snapshot) => {
      const dates = snapshot.docs.map((item) => item.data().date)
      setProgressDates(dates)
    })
    return () => unsub()
  }, [user])

  const streak = useMemo(() => {
    if (progressDates.length === 0) return 0
    const studiedSet = new Set(progressDates)
    let count = 0
    let cursor = dayjs()
    while (studiedSet.has(cursor.format('YYYY-MM-DD'))) {
      count += 1
      cursor = cursor.subtract(1, 'day')
    }
    return count
  }, [progressDates])

  const handleStudyToday = async () => {
    if (!user) return
    setSaving(true)
    const todayKey = dayjs().format('YYYY-MM-DD')
    const progressDoc = doc(db, 'progress', `${user.uid}_${todayKey}`)
    await setDoc(
      progressDoc,
      {
        uid: user.uid,
        date: todayKey,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    )
    setSaving(false)
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-alego-500">
          Bem-vindo(a), {profile?.displayName || 'Aluno'}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-alego-700">
          Sua mentoria para a Polícia Legislativa está organizada aqui.
        </h1>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/flashcards"
            className="rounded-full bg-alego-600 px-6 py-3 text-sm font-semibold text-white"
          >
            Ir para os flashcards
          </Link>
          <button
            type="button"
            onClick={handleStudyToday}
            disabled={saving}
            className="rounded-full border border-alego-600 px-6 py-3 text-sm font-semibold text-alego-600 disabled:opacity-60"
          >
            Marcar estudo de hoje
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-gradient-to-br from-alego-600 to-alego-500 p-6 text-white">
              <TrophyIcon className="h-8 w-8" />
              <p className="mt-2 text-sm uppercase tracking-wide text-alego-100">
                Dias seguidos
              </p>
              <p className="text-4xl font-black">{streak}🔥</p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <BookOpenIcon className="h-8 w-8 text-alego-500" />
              <p className="mt-2 text-sm uppercase tracking-wide text-slate-400">
                Favoritos
              </p>
              <p className="text-4xl font-black text-alego-700">
                {profile?.favorites?.length || 0}
              </p>
            </div>
          </div>
          <ProgressCalendar dates={progressDates} streak={streak} />
        </div>
        <AIChat />
      </div>
    </div>
  )
}

export default Dashboard

