# Script PowerShell para Deploy de Funções Firebase
# Uso: .\deploy-functions.ps1

Write-Host "🚀 Iniciando deploy das funções Firebase..." -ForegroundColor Cyan

# Verificar se está no diretório correto
if (-not (Test-Path "firebase.json")) {
    Write-Host "❌ Erro: firebase.json não encontrado!" -ForegroundColor Red
    Write-Host "Execute este script na raiz do projeto." -ForegroundColor Yellow
    exit 1
}

# Verificar se Firebase CLI está instalado
Write-Host "`n📋 Verificando Firebase CLI..." -ForegroundColor Cyan
try {
    $firebaseVersion = firebase --version 2>&1
    Write-Host "✅ Firebase CLI encontrado: $firebaseVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Firebase CLI não encontrado!" -ForegroundColor Red
    Write-Host "Instale com: npm install -g firebase-tools" -ForegroundColor Yellow
    exit 1
}

# Verificar login
Write-Host "`n🔐 Verificando login no Firebase..." -ForegroundColor Cyan
$loginStatus = firebase login:list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Não está logado. Fazendo login..." -ForegroundColor Yellow
    firebase login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erro ao fazer login!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ Login verificado" -ForegroundColor Green
}

# Verificar projeto
Write-Host "`n📁 Verificando projeto Firebase..." -ForegroundColor Cyan
$project = firebase use 2>&1 | Select-String "Using project"
if ($project) {
    Write-Host "✅ $project" -ForegroundColor Green
} else {
    Write-Host "⚠️  Projeto não configurado. Configurando..." -ForegroundColor Yellow
    firebase use --add
}

# Instalar dependências
Write-Host "`n📦 Instalando dependências das funções..." -ForegroundColor Cyan
Set-Location functions
if (Test-Path "package.json") {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erro ao instalar dependências!" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    Write-Host "✅ Dependências instaladas" -ForegroundColor Green
} else {
    Write-Host "❌ package.json não encontrado na pasta functions!" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..

# Fazer deploy
Write-Host "`n🚀 Fazendo deploy das funções..." -ForegroundColor Cyan
Write-Host "Isso pode levar alguns minutos..." -ForegroundColor Yellow
firebase deploy --only functions

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Deploy concluído com sucesso!" -ForegroundColor Green
    Write-Host "`n📊 Para ver os logs, execute: firebase functions:log" -ForegroundColor Cyan
    Write-Host "🌐 Acesse o console: https://console.firebase.google.com/project/plegi-d84c2/functions" -ForegroundColor Cyan
} else {
    Write-Host "`n❌ Erro durante o deploy!" -ForegroundColor Red
    Write-Host "Verifique os erros acima e tente novamente." -ForegroundColor Yellow
    exit 1
}









































