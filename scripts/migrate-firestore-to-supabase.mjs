#!/usr/bin/env node
/**
 * Copia todos os documentos Firestore → Supabase (tabela firestore_docs).
 */
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import admin from 'firebase-admin'
import { OAuth2Client } from 'google-auth-library'
import { Firestore, Timestamp, GeoPoint, DocumentReference } from '@google-cloud/firestore'

const FIREBASE_CLI_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZf72fLB6OuZZFXF0wh288'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const onlyCollection = [...args].find((a) => !a.startsWith('--')) || null
const BATCH = 400

async function initFirebase() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'plegi-d84c2'

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (json) {
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) })
    }
    return admin.firestore()
  }

  const cfgPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json')
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
    const tokens = cfg.tokens || {}
    const oauth2 = new OAuth2Client(FIREBASE_CLI_CLIENT_ID, FIREBASE_CLI_CLIENT_SECRET)

    if (tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 60_000) {
      oauth2.setCredentials({ access_token: tokens.access_token })
      return new Firestore({ projectId, authClient: oauth2 })
    }

    if (tokens.refresh_token) {
      oauth2.setCredentials({ refresh_token: tokens.refresh_token })
      try {
        const { credentials } = await oauth2.refreshAccessToken()
        oauth2.setCredentials(credentials)
        return new Firestore({ projectId, authClient: oauth2 })
      } catch (err) {
        console.warn('Refresh token falhou, tentando access_token direto…', err.message)
        if (tokens.access_token) {
          oauth2.setCredentials({ access_token: tokens.access_token })
          return new Firestore({ projectId, authClient: oauth2 })
        }
      }
    }
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId,
      credential: admin.credential.applicationDefault(),
    })
  }
  return admin.firestore()
}

function initSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  }
  return { url: url.replace(/\/$/, ''), key }
}

async function upsertBatch(supabase, rows) {
  if (!rows.length) return
  if (dryRun) {
    console.log(`[dry-run] upsert ${rows.length} docs (ex: ${rows[0].path})`)
    return
  }
  const payload = rows.map((r) => ({
    path: r.path,
    parent_path: r.parentPath,
    doc_id: r.docId,
    data: r.data,
    updated_at: new Date().toISOString(),
  }))
  const res = await fetch(`${supabase.url}/rest/v1/firestore_docs`, {
    method: 'POST',
    headers: {
      apikey: supabase.key,
      Authorization: `Bearer ${supabase.key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upsert failed (${res.status}): ${text}`)
  }
}

function serialize(value) {
  if (value == null) return null
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (value?.toDate) return value.toDate().toISOString()
  if (value instanceof GeoPoint) return { _geo: { lat: value.latitude, lng: value.longitude } }
  if (value instanceof DocumentReference) return { _ref: value.path }
  if (Array.isArray(value)) return value.map(serialize)
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v)
    return out
  }
  return value
}

async function* walkCollection(db, collectionRef, parentPath) {
  const snap = await collectionRef.get()
  for (const docSnap of snap.docs) {
    const path = `${parentPath}/${docSnap.id}`
    yield { path, parentPath, docId: docSnap.id, data: serialize(docSnap.data()) }
    const subcols = await docSnap.ref.listCollections()
    for (const sub of subcols) {
      if (onlyCollection && !path.startsWith(onlyCollection) && sub.id !== onlyCollection) {
        continue
      }
      yield* walkCollection(db, sub, sub.path)
    }
  }
}

async function main() {
  console.log('Conectando ao Firestore (Firebase CLI / service account)…')
  const db = await initFirebase()
  const supabase = initSupabase()
  let buffer = []
  let total = 0

  const roots = onlyCollection
    ? [onlyCollection]
    : [
        'users',
        'courses',
        'config',
        'flashcards',
        'progress',
        'posts',
        'reviews',
        'transactions',
        'generationActiveJobs',
        'generationResumeQueue',
        'professorSupervisorReviews',
        'professorSupervisorHistory',
        'professorSupervisorQueue',
        'siteSettings',
        'homeBanners',
        'mockReviews',
        'leads',
        'blog_articles',
        'chats',
        'courseEntitlements',
        'paymentBrickRequests',
        'purchaseReviews',
        'sharedSimulados',
        'sharedQuestoes',
        'vesperaShares',
        'userVesperaProgress',
        'userEditalProgress',
        'onlineStatus',
        'presence',
        'follows',
        'trilhaFeed',
        'feedReports',
        'passwordResetTokens',
        'questoesStats',
        'studyPlannerRecommendations',
        'editalProgress',
        'testTrials',
        'sharedFlashcards',
        'questoesCache',
        'explanationsCache',
        'mindMapsCache',
        'deletedUsers',
        'adminMateriaisConcurso',
        'leisCache',
      ]

  for (const root of roots) {
    console.log(`→ ${root}`)
    try {
      for await (const row of walkCollection(db, db.collection(root), root)) {
        buffer.push(row)
        total++
        if (buffer.length >= BATCH) {
          await upsertBatch(supabase, buffer)
          buffer = []
          if (total % 2000 === 0) console.log(`  ${total} docs…`)
        }
      }
    } catch (err) {
      console.warn(`  skip ${root}:`, err.message)
    }
  }

  if (buffer.length) await upsertBatch(supabase, buffer)
  console.log(`Concluído: ${total} documentos${dryRun ? ' (dry-run)' : ''}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
