# Script para implantar regras do Firestore
Write-Host "Implantando regras do Firestore..." -ForegroundColor Green

# Verificar se o Firebase CLI está instalado
try {
    firebase --version | Out-Null
} catch {
    Write-Host "Firebase CLI não encontrado. Instale com: npm install -g firebase-tools" -ForegroundColor Red
    exit 1
}

# Implantar regras do Firestore
firebase deploy --only firestore:rules

Write-Host "Regras do Firestore implantadas com sucesso!" -ForegroundColor Green
