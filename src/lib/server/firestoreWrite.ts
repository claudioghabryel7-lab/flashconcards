import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

type FirestoreRow = {
  path: string
  parent_path: string
  doc_id: string
  data: Record<string, unknown>
  updated_at: string
  created_at?: string
}

export async function upsertFirestoreRow(row: FirestoreRow) {
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('firestore_docs').upsert(row, { onConflict: 'path' })
  if (error) throw new Error(error.message)
}

export async function deleteFirestoreRow(path: string) {
  const sb = getSupabaseAdmin()
  const { error } = await sb.from('firestore_docs').delete().eq('path', path)
  if (error) throw new Error(error.message)
}
