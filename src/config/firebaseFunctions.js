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
  
  // Função para criar pagamento PIX real no Mercado Pago
  createPixPayment: `${FIREBASE_FUNCTIONS_BASE_URL}/createPixPayment`,
  createCheckoutPreference: `${FIREBASE_FUNCTIONS_BASE_URL}/createCheckoutPreference`,
  getMercadoPagoPublicConfig: `${FIREBASE_FUNCTIONS_BASE_URL}/getMercadoPagoPublicConfig`,
  processBrickPayment: `${FIREBASE_FUNCTIONS_BASE_URL}/processBrickPayment`,
  
  // Função para enviar email personalizado de redefinição de senha
  sendPasswordResetEmail: `${FIREBASE_FUNCTIONS_BASE_URL}/sendPasswordResetEmail`,
  
  // Função para atualizar senha do usuário usando token de reset
  updateUserPassword: `${FIREBASE_FUNCTIONS_BASE_URL}/updateUserPassword`,

  // Envio de email formatado pelo admin
  sendAdminBroadcastEmail: `${FIREBASE_FUNCTIONS_BASE_URL}/sendAdminBroadcastEmail`,

  sendEmailVerificationCode: `${FIREBASE_FUNCTIONS_BASE_URL}/sendEmailVerificationCode`,
  verifyEmailCode: `${FIREBASE_FUNCTIONS_BASE_URL}/verifyEmailCode`,
  sendRetroactiveWelcomeEmails: `${FIREBASE_FUNCTIONS_BASE_URL}/sendRetroactiveWelcomeEmails`,
  
  // Função para gerar notícias de concursos automaticamente com IA
  generateConcursoNews: `${FIREBASE_FUNCTIONS_BASE_URL}/generateConcursoNews`,
  
  // Função para gerar notícia de concurso a partir de um link de referência
  generateNewsFromLink: `${FIREBASE_FUNCTIONS_BASE_URL}/generateNewsFromLink`,

  nudgeGenerationJobResume: `${FIREBASE_FUNCTIONS_BASE_URL}/nudgeGenerationJobResume`,
  kickGenerationJob: `${FIREBASE_FUNCTIONS_BASE_URL}/kickGenerationJob`,
  cancelGenerationJob: `${FIREBASE_FUNCTIONS_BASE_URL}/cancelGenerationJob`,
  runContentAutomationNow: `${FIREBASE_FUNCTIONS_BASE_URL}/runContentAutomationNow`,
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

