# Sincroniza .env + functions/.env -> Vercel Production (backend Next.js/Vercel).
# Uso: npx vercel login
#      .\scripts\sync-vercel-env-firebase.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $root ".env"
$fnEnvFile = Join-Path $root "functions\.env"
if (-not (Test-Path $envFile)) { Write-Error ".env não encontrado." }

function Read-EnvMap($path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $i = $_.IndexOf('=')
    $k = $_.Substring(0, $i).Trim()
    $v = $_.Substring($i + 1)
    if ($k) { $map[$k] = $v }
  }
  return $map
}

$map = Read-EnvMap $envFile
$fnMap = Read-EnvMap $fnEnvFile
foreach ($k in $fnMap.Keys) {
  if (-not $map.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($map[$k])) {
    $map[$k] = $fnMap[$k]
  }
}

$map["VITE_USE_SUPABASE"] = "false"
$map["NEXT_PUBLIC_USE_SUPABASE"] = "false"
$map["NEXT_PUBLIC_SITE_URL"] = "https://www.flashconcards.com.br"
$map["MERCADOPAGO_WEBHOOK_URL"] = "https://www.flashconcards.com.br/api/mercadopago/webhook"
$map["MERCADOPAGO_MODE"] = "prod"

$keys = @(
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_VAPID_KEY",
  "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
  "VITE_GEMINI_API_KEY",
  "GEMINI_API_KEY",
  "VITE_USE_SUPABASE",
  "NEXT_PUBLIC_USE_SUPABASE",
  "NEXT_PUBLIC_SITE_URL",
  "CRON_SECRET",
  "EMAIL_USER",
  "EMAIL_PASSWORD",
  "MERCADOPAGO_WEBHOOK_URL",
  "MERCADOPAGO_ACCESS_TOKEN_PROD",
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_PUBLIC_KEY_PROD",
  "MERCADOPAGO_PUBLIC_KEY",
  "NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY",
  "MERCADOPAGO_MODE",
  "FIREBASE_SERVICE_ACCOUNT_KEY"
)

Write-Host "Enviando variáveis para Vercel (Production)..."
foreach ($key in $keys) {
  if (-not $map.ContainsKey($key)) { continue }
  $val = $map[$key]
  if ([string]::IsNullOrWhiteSpace($val)) { continue }
  Write-Host "  -> $key"
  $val | npx vercel env add $key production --force 2>$null
}

Write-Host ""
Write-Host "Feito. Se FIREBASE_SERVICE_ACCOUNT_KEY não estiver no .env,"
Write-Host "gere em Firebase Console > Configurações > Contas de serviço > Gerar nova chave privada"
Write-Host "e cole o JSON inteiro em FIREBASE_SERVICE_ACCOUNT_KEY no Vercel."
Write-Host ""
Write-Host "Deploy: git push (auto) ou npx vercel --prod"
