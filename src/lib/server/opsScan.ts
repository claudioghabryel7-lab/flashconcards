import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { collectGeminiApiKeys } = require('../../utils/geminiKeyPool.js')
const { getAdmin } = require('../../../server/admin/initFirebaseAdmin.cjs')

const GCP_HEALTH_URL =
  'https://us-central1-plegi-d84c2.cloudfunctions.net/healthCheckV2'

export type OpsIssue = {
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  action?: string
  fixPrompt?: string
}

export type OpsScanResult = {
  scannedAt: string
  stack: 'firebase'
  stats: Record<string, unknown>
  issues: OpsIssue[]
  summary: string
  cursorPrompt: string
}

function pushIssue(issues: OpsIssue[], issue: OpsIssue) {
  issues.push(issue)
}

function envPresent(name: string) {
  const v = process.env[name]
  return Boolean(v && v !== 'undefined' && String(v).trim())
}

export async function runOpsScan(siteBaseUrl: string): Promise<OpsScanResult> {
  const issues: OpsIssue[] = []
  const stats: Record<string, unknown> = {
    stack: 'firebase',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'plegi-d84c2',
    siteBaseUrl,
  }

  // Cloud Functions health
  try {
    const res = await fetch(GCP_HEALTH_URL, { signal: AbortSignal.timeout(25000) })
    const health = await res.json().catch(() => ({}))
    stats.gcpHealthStatus = health.status || (res.ok ? 'ok' : 'error')
    stats.gcpHealthChecks = health.checks || {}
    stats.gcpHealthHttp = res.status

    const checks = health.checks || {}
    if (checks.firestore === 'error') {
      pushIssue(issues, {
        severity: 'critical',
        title: 'Firestore inacessível (GCP)',
        detail: 'O health check das Cloud Functions não conseguiu ler o Firestore.',
        action: 'Verifique billing Firebase, regras Firestore e credenciais do projeto plegi-d84c2.',
        fixPrompt: 'Diagnostique por que admin.firestore() falha no healthCheckV2 do projeto plegi-d84c2.',
      })
    }
    if (checks.auth === 'error') {
      pushIssue(issues, {
        severity: 'warning',
        title: 'Firebase Auth Admin com erro',
        detail: 'listUsers falhou no health check GCP.',
        action: 'Confirme permissões IAM e service account das Cloud Functions.',
      })
    }
    if (checks.email === 'missing') {
      pushIssue(issues, {
        severity: 'warning',
        title: 'E-mail não configurado no servidor',
        detail: 'SMTP ausente nas Cloud Functions.',
        action: 'Configure EMAIL_USER e EMAIL_PASSWORD em functions/.env e redeploy.',
      })
    }
    if (checks.mercadopago === 'missing') {
      pushIssue(issues, {
        severity: 'warning',
        title: 'Mercado Pago não configurado',
        detail: 'Token MP ausente no backend GCP.',
        action: 'Configure MERCADOPAGO_ACCESS_TOKEN_PROD em functions/.env.',
      })
    }
    if (checks.gemini !== 'configured') {
      pushIssue(issues, {
        severity: 'critical',
        title: 'Gemini ausente no GCP',
        detail: 'Nenhuma chave Gemini nas Cloud Functions.',
        action: 'Rode npm run sync:gemini-env e faça deploy das functions.',
      })
    }
  } catch (err) {
    pushIssue(issues, {
      severity: 'critical',
      title: 'Cloud Functions offline',
      detail: err instanceof Error ? err.message : 'healthCheckV2 inacessível',
      action: 'Verifique billing GCP e deploy: firebase deploy --only functions',
    })
  }

  // Firestore counts (best effort)
  try {
    const db = getAdmin().firestore()
    const [coursesSnap, usersSnap] = await Promise.all([
      db.collection('courses').limit(500).get(),
      db.collection('users').limit(500).get(),
    ])
    stats.courses = coursesSnap.size
    stats.users = usersSnap.size
    if (coursesSnap.size === 0) {
      pushIssue(issues, {
        severity: 'info',
        title: 'Nenhum curso no Firestore',
        detail: 'Coleção courses vazia.',
        action: 'Cadastre cursos na aba Cursos do Admin.',
      })
    }
  } catch (err) {
    pushIssue(issues, {
      severity: 'warning',
      title: 'Firestore local/API sem credencial admin',
      detail: err instanceof Error ? err.message : 'Não foi possível contar docs',
      action: 'Normal em dev sem GOOGLE_APPLICATION_CREDENTIALS; use o health GCP acima.',
    })
  }

  // Env Next.js / Vercel
  const requiredEnv = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_GEMINI_API_KEY',
  ]
  const missingEnv = requiredEnv.filter((k) => !envPresent(k))
  stats.missingEnv = missingEnv
  if (missingEnv.length) {
    pushIssue(issues, {
      severity: 'critical',
      title: 'Variáveis .env faltando',
      detail: missingEnv.join(', '),
      action: 'Preencha o .env na raiz e reinicie npm run dev.',
    })
  }

  const geminiKeys = collectGeminiApiKeys()
  stats.geminiKeyCount = geminiKeys.length
  if (geminiKeys.length === 0) {
    pushIssue(issues, {
      severity: 'critical',
      title: 'Gemini não configurado no Next.js',
      detail: 'VITE_GEMINI_API_KEY ausente ou inválida.',
      action: 'Adicione a chave no .env para IA no admin e geração de conteúdo.',
    })
  }

  if (envPresent('VITE_USE_SUPABASE') && process.env.VITE_USE_SUPABASE === 'true') {
    pushIssue(issues, {
      severity: 'warning',
      title: 'Supabase ainda ativo no .env',
      detail: 'VITE_USE_SUPABASE=true — stack atual é Firebase puro.',
      action: 'Defina VITE_USE_SUPABASE=false e NEXT_PUBLIC_USE_SUPABASE=false no .env.',
      fixPrompt: 'Remova flags Supabase do .env e confirme que firebase/config.js usa Firestore nativo.',
    })
  }

  const critical = issues.filter((i) => i.severity === 'critical').length
  const warning = issues.filter((i) => i.severity === 'warning').length
  const info = issues.filter((i) => i.severity === 'info').length

  let summary = 'Sistema aparenta estar saudável (Firebase/GCP).'
  if (critical > 0) summary = `${critical} problema(s) crítico(s) para corrigir.`
  else if (warning > 0) summary = `${warning} aviso(s) — revise configuração.`
  else if (info > 0) summary = `${info} observação(ões) informativas.`

  const cursorPrompt = buildCursorFixPrompt(issues, stats, summary)

  return {
    scannedAt: new Date().toISOString(),
    stack: 'firebase',
    stats,
    issues,
    summary,
    cursorPrompt,
  }
}

function buildCursorFixPrompt(
  issues: OpsIssue[],
  stats: Record<string, unknown>,
  summary: string,
) {
  const lines = [
    'Corrija os problemas do site Flashconcards (stack Firebase + Cloud Functions GCP, SEM Supabase).',
    '',
    `Resumo: ${summary}`,
    '',
    'Stats:',
    JSON.stringify(stats, null, 2),
    '',
    'Issues:',
  ]
  issues.forEach((issue, i) => {
    lines.push(`${i + 1}. [${issue.severity}] ${issue.title}`)
    lines.push(`   ${issue.detail}`)
    if (issue.action) lines.push(`   Ação: ${issue.action}`)
  })
  lines.push('', 'Priorize correções que desbloqueiam login, Firestore, pagamentos e geração IA.')
  return lines.join('\n')
}
