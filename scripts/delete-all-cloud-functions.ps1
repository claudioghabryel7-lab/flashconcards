# Deleta todas as Cloud Functions do projeto (zera custo GCP).
# Requer: firebase login --reauth

$ErrorActionPreference = "Continue"
$project = "plegi-d84c2"

Write-Host "Listando functions..."
$raw = firebase functions:list --project $project 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
  Write-Host $raw
  Write-Error "Falha ao listar. Rode: firebase login --reauth"
}

$names = [regex]::Matches($raw, '^\│\s+([a-zA-Z0-9]+)\s+│', [System.Text.RegularExpressions.RegexOptions]::Multiline) |
  ForEach-Object { $_.Groups[1].Value } |
  Where-Object { $_ -and $_ -ne 'Function' } |
  Select-Object -Unique

if (-not $names -or $names.Count -eq 0) {
  Write-Host "Nenhuma function encontrada (ou parse falhou)."
  exit 0
}

Write-Host "Deletando $($names.Count) function(s)..."
foreach ($name in $names) {
  Write-Host "  - $name"
  firebase functions:delete $name --project $project --force 2>&1
}

Write-Host "Concluído."
