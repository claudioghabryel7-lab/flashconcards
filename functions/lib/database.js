/**
 * Patch firebase-admin to use Supabase when USE_SUPABASE=true.
 */
const {
  createSupabaseFirestore,
  FieldValue,
  Timestamp,
  useSupabaseDatabase,
} = require('./supabaseFirestore')

let patched = false

function patchAdminFirestore(admin) {
  if (patched || !useSupabaseDatabase()) return false
  const supa = createSupabaseFirestore()
  admin.firestore = Object.assign(() => supa, {
    FieldValue,
    Timestamp,
  })
  patched = true
  console.info('[database] Cloud Functions usando Supabase (firestore_docs)')
  return true
}

function getDb(admin) {
  return admin.firestore()
}

module.exports = {
  patchAdminFirestore,
  useSupabaseDatabase,
  getDb,
  FieldValue,
  Timestamp,
}
