/**
 * Configuração das URLs das Funções Firebase
 * 
 * Após fazer deploy das funções, atualize as URLs abaixo com as URLs reais
 * que aparecem no terminal após o deploy.
 * 
 * Exemplo de URL após deploy:
 * https://us-central1-plegi-d84c2.cloudfunctions.net/nomeDaFuncao
 */

// URL base das funções Firebase
const FIREBASE_FUNCTIONS_BASE_URL = 'https://us-central1-plegi-d84c2.cloudfunctions.net'

// URLs das funções
export const FIREBASE_FUNCTIONS = {
  // Função para criar usuário e enviar email com credenciais
  createUserAndSendEmail: `${FIREBASE_FUNCTIONS_BASE_URL}/createUserAndSendEmail`,
  
  // Função para processar webhook do Mercado Pago
  webhookMercadoPago: `${FIREBASE_FUNCTIONS_BASE_URL}/webhookMercadoPago`,
}

/**
 * Como atualizar após deploy:
 * 
 * 1. Execute: firebase deploy --only functions
 * 2. Copie as URLs que aparecem no terminal
 * 3. Atualize as URLs acima
 * 4. Salve o arquivo
 */

export default FIREBASE_FUNCTIONS

