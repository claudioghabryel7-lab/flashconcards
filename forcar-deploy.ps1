# Script para forçar deploy no Vercel
# Uso: .\forcar-deploy.ps1

Write-Host "🚀 Forçando deploy no Vercel..." -ForegroundColor Cyan

# Opção 1: Push vazio (força deploy automático)
Write-Host "`n📤 Fazendo push vazio para forçar deploy automático..." -ForegroundColor Yellow
git commit --allow-empty -m "Force deploy - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git push

Write-Host "`n✅ Push realizado! O Vercel deve iniciar o deploy automaticamente." -ForegroundColor Green
Write-Host "`n💡 Dica: Acesse https://vercel.com para acompanhar o deploy em tempo real." -ForegroundColor Cyan









