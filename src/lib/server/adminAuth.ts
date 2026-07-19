import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { initBackend } = require('../../../server/backend/init.cjs')

const ADMIN_EMAIL = 'claudioghabryel.cg@gmail.com'

export type AdminUser = {
  uid: string
  email?: string
  role?: string
}

export async function verifyAdminRequest(request: Request): Promise<AdminUser | null> {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null

  const admin = initBackend()
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    const isAdmin =
      decoded.role === 'admin' || decoded.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    if (!isAdmin) return null
    return { uid: decoded.uid, email: decoded.email, role: decoded.role as string | undefined }
  } catch {
    return null
  }
}
