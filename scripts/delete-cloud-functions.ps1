# Remove Cloud Functions do GCP para zerar custos (backend agora roda na Vercel).
# Requer: firebase login --reauth
# ATENÇÃO: irreversível até novo deploy.

$project = "plegi-d84c2"

Write-Host "Listando functions ativas..."
firebase functions:list --project $project

Write-Host ""
Write-Host "Para deletar TODAS as functions, rode no Firebase Console:"
Write-Host "  https://console.firebase.google.com/project/$project/functions"
Write-Host ""
Write-Host "Ou delete em lote (cuidado):"
Write-Host "  firebase functions:delete FUNCTION_NAME --project $project --force"
Write-Host ""
Write-Host "Backend substituto: rotas /api/* no Next.js (vercel.json crons)."
