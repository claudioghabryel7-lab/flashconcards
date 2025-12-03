# Script para forçar deploy no Vercel
# Uso: .\forcar-deploy.ps1

Write-Host "🚀 Forçando deploy no Vercel..." -ForegroundColor Cyan
Write-Host ""

# Verificar se o Vercel CLI está instalado
try {
    $vercelVersion = vercel --version 2>&1
    Write-Host "✅ Vercel CLI encontrado: $vercelVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Vercel CLI não encontrado. Instalando..." -ForegroundColor Red
    npm install -g vercel
}

Write-Host ""
Write-Host "📤 Forçando deploy de produção..." -ForegroundColor Yellow

# Tentar fazer deploy direto via CLI (força mesmo sem estar linkado)
# Usa --yes para confirmar automaticamente
# Usa --force para forçar mesmo se houver conflitos
try {
    vercel --prod --yes --force 2>&1 | ForEach-Object {
        if ($_ -match "Error|error|not valid|login") {
            Write-Host "⚠️ $_" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "💡 Fazendo push para acionar deploy automático via Git..." -ForegroundColor Cyan
            
            # Fallback: tentar push para acionar deploy automático
            $hasRemote = git remote | Measure-Object -Line
            if ($hasRemote.Lines -gt 0) {
                Write-Host "📤 Fazendo commit vazio e push..." -ForegroundColor Yellow
                git commit --allow-empty -m "Force deploy - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>&1 | Out-Null
                git push 2>&1
                Write-Host ""
                Write-Host "✅ Push realizado! O Vercel deve iniciar o deploy automaticamente." -ForegroundColor Green
            } else {
                Write-Host "❌ Nenhum remote Git configurado." -ForegroundColor Red
                Write-Host ""
                Write-Host "🔧 Para configurar o deploy automático:" -ForegroundColor Cyan
                Write-Host "   1. Acesse https://vercel.com" -ForegroundColor White
                Write-Host "   2. Faça login e importe seu projeto" -ForegroundColor White
                Write-Host "   3. Ou execute: vercel login" -ForegroundColor White
            }
        } else {
            Write-Host "$_" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Erro ao fazer deploy: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Tentando push para acionar deploy automático via Git..." -ForegroundColor Cyan
    
    $hasRemote = git remote | Measure-Object -Line
    if ($hasRemote.Lines -gt 0) {
        Write-Host "📤 Fazendo commit vazio e push..." -ForegroundColor Yellow
        git commit --allow-empty -m "Force deploy - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>&1 | Out-Null
        git push 2>&1
        Write-Host ""
        Write-Host "✅ Push realizado! O Vercel deve iniciar o deploy automaticamente." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "💡 Acesse https://vercel.com para acompanhar o deploy em tempo real." -ForegroundColor Cyan
Write-Host ""
