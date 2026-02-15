# Script para configurar Git com login persistente
# Execute este script no PowerShell como Administrador

Write-Host "🔧 Configurando Git para login persistente..." -ForegroundColor Green

# Configurar credential helper para persistir login
git config --global credential.helper manager
git config --global credential.cache "C:\Users\FlashConCards\AppData\Local\Git\credential-cache"

# Configurar timeout maior (em segundos = 8 horas)
git config --global credential.cache.timeout 28800

# Configurar para usar Windows Credential Manager
git config --global credential.helper "manager-core"

Write-Host "✅ Git configurado com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Configurações aplicadas:" -ForegroundColor Yellow
Write-Host "  - credential.helper: manager" -ForegroundColor White
Write-Host "  - credential.cache: C:\Users\FlashConCards\AppData\Local\Git\credential-cache" -ForegroundColor White
Write-Host "  - credential.cache.timeout: 28800 segundos (8 horas)" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Agora seu login no GitHub vai persistir por muito mais tempo!" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Dica: Faça login uma vez com 'git push' e ele vai pedir credenciais." -ForegroundColor Gray
Write-Host "   Depois disso, o login vai ficar salvo para os próximos pushes." -ForegroundColor Gray
