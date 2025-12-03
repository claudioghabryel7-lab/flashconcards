# Script para forçar deploy no Vercel - Versão Completa
# Este script tenta múltiplas formas de fazer deploy

Write-Host "🚀 Iniciando deploy no Vercel..." -ForegroundColor Cyan
Write-Host ""

# Método 1: Tentar deploy direto via Vercel CLI
Write-Host "📦 Tentando deploy direto via Vercel CLI..." -ForegroundColor Yellow
try {
    $result = vercel --prod --yes 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Deploy realizado com sucesso via CLI!" -ForegroundColor Green
        exit 0
    }
    Write-Host "⚠️ CLI não funcionou, tentando método alternativo..." -ForegroundColor Yellow
} catch {
    Write-Host "⚠️ Erro no CLI: $_" -ForegroundColor Yellow
}

Write-Host ""

# Método 2: Criar commit vazio e fazer push (aciona deploy automático)
Write-Host "📤 Tentando acionar deploy automático via Git push..." -ForegroundColor Yellow

# Verificar se há commits
$hasCommits = git rev-parse --verify HEAD 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Repositório Git encontrado" -ForegroundColor Green
    
    # Verificar se há remote
    $remotes = git remote -v
    if ($remotes) {
        Write-Host "✅ Remote Git configurado" -ForegroundColor Green
        
        # Criar commit vazio
        Write-Host "📝 Criando commit vazio para forçar deploy..." -ForegroundColor Yellow
        git commit --allow-empty -m "Force deploy - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Commit criado" -ForegroundColor Green
            
            # Fazer push
            Write-Host "📤 Fazendo push..." -ForegroundColor Yellow
            git push 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host ""
                Write-Host "✅ Push realizado com sucesso!" -ForegroundColor Green
                Write-Host "🚀 O Vercel deve iniciar o deploy automático em alguns segundos..." -ForegroundColor Cyan
                Write-Host ""
                Write-Host "💡 Acesse https://vercel.com para acompanhar o deploy" -ForegroundColor Cyan
                exit 0
            } else {
                Write-Host "❌ Erro ao fazer push" -ForegroundColor Red
            }
        } else {
            Write-Host "⚠️ Nenhuma mudança para commitar" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Nenhum remote Git configurado" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Repositório Git não inicializado" -ForegroundColor Red
}

Write-Host ""
Write-Host "❌ Não foi possível fazer deploy automaticamente" -ForegroundColor Red
Write-Host ""
Write-Host "🔧 Opções para fazer deploy manualmente:" -ForegroundColor Cyan
Write-Host "   1. Acesse https://vercel.com e faça deploy manualmente" -ForegroundColor White
Write-Host "   2. Execute: vercel login (e depois: vercel --prod)" -ForegroundColor White
Write-Host "   3. Configure integração Git no Vercel para deploy automático" -ForegroundColor White
Write-Host ""


