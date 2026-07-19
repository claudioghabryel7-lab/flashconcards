import { createRequire } from 'module'

import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin'

const require = createRequire(import.meta.url)
const { collectGeminiApiKeys } = require('../../utils/geminiKeyPool.js')

export type OpsIssue = {
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  action?: string
}

export type OpsScanResult = {
  scannedAt: string
  stats: Record<string, unknown>
  issues: OpsIssue[]
  summary: string
}

function envFlag(name: string) {
  const v = process.env[name] || process.env[name.replace('VITE_', 'NEXT_PUBLIC_')]
  return v === 'true' || v === '1'
}

function pushIssue(issues: OpsIssue[], issue: OpsIssue) {
  issues.push(issue)
}

export async function runOpsScan(baseUrl: string): Promise<OpsScanResult> {
  const issues: OpsIssue[] = []
  const stats: Record<string, unknown> = {
    useSupabase: envFlag('VITE_USE_SUPABASE') || envFlag('USE_SUPABASE'),
    nodeEnv: process.env.NODE_ENV || 'unknown',
  }

  // Backend health
  try {
    const healthUrl = `${baseUrl.replace(/\/$/, '')}/api/backend/health`
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(25000) })
    const health = await res.json().catch(() => ({}))
    stats.healthStatus = health.status || (res.ok ? 'ok' : 'error')
    stats.healthChecks = health.checks || {}
    stats.healthHttp = res.status

    const checks = health.checks || {}
    if (checks.firestore === 'error') {
      pushIssue(issues, {
        severity: 'warning',
        title: 'Health: Firestore/Supabase',
        detail: 'O health check não conseguiu ler `_health/ping` no banco.',
        action: 'Crie o doc de ping ou ignore se o site lê/grava normalmente via Supabase.',
      })
    }
    if (checks.auth === 'error') {
      pushIssue(issues, {
        severity: 'info',
        title: 'Health: Firebase Auth Admin',
        detail: 'Credenciais Admin locais ausentes ou inválidas.',
        action: 'Normal em dev local; configure GOOGLE_APPLICATION_CREDENTIALS em produção.',
      })
    }
    if (checks.email === 'missing') {
      pushIssue(issues, {
        severity: 'warning',
        title: 'E-mail não configurado',
        detail: 'SMTP/credenciais de e-mail ausentes no servidor.',
        action: 'Configure variáveis de e-mail no .env / Vercel para reset de senha e broadcasts.',
      })
    }
    if (checks.mercadopago === 'missing') {
      pushIssue(issues, {
        severity: 'warning',
        title: 'Mercado Pago não configurado',
        detail: 'Token de acesso MP ausente.',
        action: 'Configure MERCADOPAGO_* no .env para pagamentos PIX/cartão.',
      })
    }
    if (checks.gemini !== 'configured') {
      pushIssue(issues, {
        severity: 'critical',
        title: 'Gemini não configurado no servidor',
        detail: 'Nenhuma VITE_GEMINI_API_KEY válida detectada.',
        action: 'Adicione chaves Gemini no .env.local e redeploy.',
      })
    }
  } catch (err) {
    pushIssue(issues, {
      severity: 'warning',
      title: 'Health check inacessível',
      detail: err instanceof Error ? err.message : 'Falha ao chamar /api/backend/health',
      action: 'Verifique se o servidor Next.js está rodando.',
    })
  }

  // Supabase stats
  try {
    const sb = getSupabaseAdmin()
    const { count: totalDocs, error: countErr } = await sb
      .from('firestore_docs')
      .select('*', { count: 'exact', head: true })
    if (countErr) throw countErr

    const { data: courseRows, error: courseErr } = await sb
      .from('firestore_docs')
      .select('path, data')
      .eq('parent_path', 'courses')
    if (courseErr) throw courseErr

    const { data: userRows, error: userErr } = await sb
      .from('firestore_docs')
      .select('path')
      .eq('parent_path', 'users')
    if (userErr) throw userErr

    stats.supabaseDocs = totalDocs ?? 0
    stats.courses = courseRows?.length ?? 0
    stats.users = userRows?.length ?? 0

    if ((courseRows?.length ?? 0) === 0) {
      pushIssue(issues, {
        severity: 'info',
        title: 'Nenhum curso cadastrado',
        detail: 'A coleção `courses` está vazia no Supabase.',
        action: 'Cadastre cursos na aba Cursos do Admin.',
      })
    }
  } catch (err) {
    pushIssue(issues, {
      severity: 'critical',
      title: 'Supabase inacessível',
      detail: err instanceof Error ? err.message : 'Erro ao consultar firestore_docs',
      action: 'Verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
    })
  }

  // Gemini keys (client + server)
  const geminiKeys = collectGeminiApiKeys()
  stats.geminiKeyCount = geminiKeys.length
  if (geminiKeys.length === 0) {
    pushIssue(issues, {
      severity: 'critical',
      title: 'Sem chaves Gemini',
      detail: 'Nenhuma API key Gemini válida no ambiente.',
      action: 'Configure VITE_GEMINI_API_KEY (e backups numeradas se quiser).',
    })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    pushIssue(issues, {
      severity: 'critical',
      title: 'Service role ausente',
      detail: 'SUPABASE_SERVICE_ROLE_KEY não definida — escritas via API falham.',
      action: 'Adicione a service role no .env (nunca exponha no client).',
    })
  }

  const critical = issues.filter((i) => i.severity === 'critical').length
  const warning = issues.filter((i) => i.severity === 'warning').length
  const info = issues.filter((i) => i.severity === 'info').length

  let summary = 'Sistema aparenta estar saudável.'
  if (critical > 0) summary = `${critical} problema(s) crítico(s) exigem correção.`
  else if (warning > 0) summary = `${warning} aviso(s) — revise configuração e integrações.`
  else if (info > 0) summary = `${info} observação(ões) informativas.`

  return {
    scannedAt: new Date().toISOString(),
    stats,
    issues,
    summary,
  }
}
