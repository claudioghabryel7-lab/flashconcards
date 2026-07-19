import { createRequire } from 'module'
import { NextResponse } from 'next/server'

import { deleteFirestoreRow, upsertFirestoreRow } from '@/lib/server/firestoreWrite'

export const runtime = 'nodejs'

const require = createRequire(import.meta.url)
const { initBackend } = require('../../../../../server/backend/init.cjs')

type WriteBody = {
  op: 'set' | 'delete'
  path: string
  parent_path?: string
  doc_id?: string
  data?: Record<string, unknown>
  updated_at?: string
  created_at?: string
}

async function verifyFirebaseToken(request: Request) {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null

  const admin = initBackend()
  try {
    return await admin.auth().verifyIdToken(token)
  } catch {
    return null
  }
}

function canDelete(uid: string, path: string, isAdmin: boolean) {
  if (isAdmin) return true
  return path.startsWith(`users/${uid}/`)
}

export async function POST(request: Request) {
  const decoded = await verifyFirebaseToken(request)
  if (!decoded?.uid) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let body: WriteBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { op, path } = body
  if (!path || !op) {
    return NextResponse.json({ error: 'path e op são obrigatórios' }, { status: 400 })
  }

  const isAdmin =
    decoded.role === 'admin' ||
    decoded.email?.toLowerCase() === 'claudioghabryel.cg@gmail.com'

  try {
    if (op === 'delete') {
      if (!canDelete(decoded.uid, path, isAdmin)) {
        return NextResponse.json({ error: 'Sem permissão para deletar' }, { status: 403 })
      }
      await deleteFirestoreRow(path)
      return NextResponse.json({ ok: true })
    }

    await upsertFirestoreRow({
      path: body.path,
      parent_path: body.parent_path || path.split('/').slice(0, -1).join('/'),
      doc_id: body.doc_id || path.split('/').pop() || '',
      data: body.data || {},
      updated_at: body.updated_at || new Date().toISOString(),
      ...(body.created_at ? { created_at: body.created_at } : {}),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gravar documento'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
