# Script para FORÇAR deploy no Vercel sempre
# Uso: .\forcar-deploy-sempre.ps1

param(
    [switch]$Silent = $false
)

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    if (-not $Silent) {
        Write-Host $Message -ForegroundColor $Color
    }
}

Write-ColorOutput "🚀 FORÇANDO DEPLOY NO VERCEL..." "Cyan"
Write-ColorOutput ""

# Navegar para o diretório do projeto
$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectPath

# Verificar se estamos em um repositório Git
$isGitRepo = Test-Path ".git"
if (-not $isGitRepo) {
    Write-ColorOutput "❌ Não é um repositório Git. Criando commit vazio pode não funcionar." "Red"
    Write-ColorOutput ""
    Write-ColorOutput "💡 Soluções:" "Cyan"
    Write-ColorOutput "   1. Execute: vercel --prod --yes (após fazer: vercel login)" "White"
    Write-ColorOutput "   2. Configure integração Git no Vercel Dashboard" "White"
    exit 1
}

# Criar commit vazio com timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMessage = "🚀 Force deploy - $timestamp"

Write-ColorOutput "📝 Criando commit vazio para forçar deploy..." "Yellow"
git commit --allow-empty -m $commitMessage 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-ColorOutput "✅ Commit vazio criado" "Green"
    
    # Verificar se há remote
    $remotes = git remote | Measure-Object -Line
    if ($remotes.Lines -gt 0) {
        Write-ColorOutput "📤 Fazendo push para acionar deploy automático..." "Yellow"
        
        # Tentar push para origin/main primeiro, depois origin/master
        $branches = @("main", "master")
        $pushed = $false
        
        foreach ($branch in $branches) {
            $currentBranch = git rev-parse --abbrev-ref HEAD 2>&1
            if ($currentBranch -eq $branch -or git show-ref --verify --quiet refs/heads/$branch 2>&1) {
                Write-ColorOutput "   Tentando push para $branch..." "Yellow"
                $pushOutput = git push origin $branch 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    Write-ColorOutput ""
                    Write-ColorOutput "✅✅✅ PUSH REALIZADO COM SUCESSO! ✅✅✅" "Green"
                    Write-ColorOutput ""
                    Write-ColorOutput "🚀 O Vercel deve iniciar o deploy automático em alguns segundos..." "Cyan"
                    Write-ColorOutput ""
                    Write-ColorOutput "💡 Acompanhe o deploy em: https://vercel.com/dashboard" "Cyan"
                    Write-ColorOutput ""
                    $pushed = $true
                    break
                }
            }
        }
        
        if (-not $pushed) {
            # Tentar push genérico
            Write-ColorOutput "   Tentando push genérico..." "Yellow"
            $pushOutput = git push 2>&1
            Write-ColorOutput $pushOutput "White"
            
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput ""
                Write-ColorOutput "✅✅✅ PUSH REALIZADO COM SUCESSO! ✅✅✅" "Green"
                Write-ColorOutput ""
                Write-ColorOutput "🚀 O Vercel deve iniciar o deploy automático em alguns segundos..." "Cyan"
            } else {
                Write-ColorOutput ""
                Write-ColorOutput "❌ Erro ao fazer push. Verifique a configuração do Git remote." "Red"
                Write-ColorOutput ""
                Write-ColorOutput "💡 Para configurar remote:" "Cyan"
                Write-ColorOutput "   git remote add origin <URL_DO_SEU_REPOSITORIO>" "White"
            }
        }
    } else {
        Write-ColorOutput "⚠️ Nenhum remote Git configurado" "Yellow"
        Write-ColorOutput ""
        Write-ColorOutput "💡 Para configurar:" "Cyan"
        Write-ColorOutput "   git remote add origin <URL_DO_SEU_REPOSITORIO>" "White"
        Write-ColorOutput "   git push -u origin main" "White"
    }
} else {
    Write-ColorOutput "⚠️ Nenhuma mudança detectada (já está atualizado ou erro no Git)" "Yellow"
}

Write-ColorOutput ""


