import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, initFirebase } from '../firebase/config'
import { DEFAULT_MAINTENANCE_MESSAGE } from '../services/adminPlatformService'

function snapshotExists(snapshot) {
  return typeof snapshot?.exists === 'function' ? snapshot.exists() : Boolean(snapshot?.exists)
}

export default function useSiteMaintenance() {
  const [loading, setLoading] = useState(true)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState(DEFAULT_MAINTENANCE_MESSAGE)

  useEffect(() => {
    initFirebase()
    if (!db) {
      setLoading(false)
      return undefined
    }

    const unsub = onSnapshot(
      doc(db, 'siteSettings', 'platform'),
      (snap) => {
        if (!snapshotExists(snap)) {
          setMaintenanceMode(false)
          setMaintenanceMessage(DEFAULT_MAINTENANCE_MESSAGE)
        } else {
          const data = snap.data() || {}
          setMaintenanceMode(Boolean(data.maintenanceMode))
          setMaintenanceMessage(data.maintenanceMessage || DEFAULT_MAINTENANCE_MESSAGE)
        }
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
    )

    return () => unsub()
  }, [])

  return { loading, maintenanceMode, maintenanceMessage }
}
