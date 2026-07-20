import { useEffect } from 'react'
import { ShieldCheckIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

const PoliticaPrivacidade = () => {
  useEffect(() => {
    // Scroll para o topo
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Voltar para o Dashboard
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <ShieldCheckIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Política de Privacidade
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Proteção e transparência dos seus dados
              </p>
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-8 space-y-8">
          
          <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border border-blue-200 dark:border-blue-800">
            <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100 mb-3">
              💙 Compromisso com a Privacidade
            </h2>
            <p className="text-blue-800 dark:text-blue-200">
              Levamos sua privacidade muito a sério e estamos em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
            </p>
          </div>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              📋 1. Dados que Coletamos
            </h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Dados Essenciais (Obrigatórios):
                </h3>
                <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 ml-4">
                  <li><strong>Email:</strong> Para autenticação e comunicação essencial</li>
                  <li><strong>Nome:</strong> Para personalização da experiência</li>
                  <li><strong>Dados de Uso:</strong> Progresso de estudos, estatísticas de aprendizado</li>
                  <li><strong>Dados de Autenticação:</strong> Informações de login do Firebase</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Dados Opcionais (Com Consentimento):
                </h3>
                <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 ml-4">
                  <li><strong>Telefone:</strong> Para comunicados importantes sobre o curso</li>
                  <li><strong>Dados de Desempenho:</strong> Resultados de simulados e questões</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              🎯 2. Como Usamos Seus Dados
            </h2>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400 ml-4">
              <li><strong>Fornecer o Serviço:</strong> Personalizar seu aprendizado e acompanhar progresso</li>
              <li><strong>Melhorar o Conteúdo:</strong> Analisar dados para otimizar questões e materiais</li>
              <li><strong>Comunicação Essencial:</strong> Enviar informações importantes sobre o curso</li>
              <li><strong>Suporte ao Usuário:</strong> Ajudar com dúvidas e problemas técnicos</li>
              <li><strong>Estatísticas Anônimas:</strong> Gerar relatórios agregados sem identificação pessoal</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              🔒 3. Compartilhamento de Dados
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-3">
              <strong>NUNCA vendemos ou compartilhamos seus dados pessoais com terceiros para fins comerciais.</strong>
            </p>
            
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
              Compartilhamento Apenas em:
            </h3>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 ml-4">
              <li><strong>Firebase/Google:</strong> Armazenamento seguro de dados e autenticação</li>
              <li><strong>APIs de IA:</strong> Gemini para gerar questões (sem armazenar dados pessoais)</li>
              <li><strong>Ordem Judicial:</strong> Se exigido por lei, após processo legal</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              ⚖️ 4. Seus Direitos (LGPD)
            </h2>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400 ml-4">
              <li><strong>Confirmar a existência de tratamento:</strong> Saber se temos seus dados</li>
              <li><strong>Acessar seus dados:</strong> Ver todas informações que temos sobre você</li>
              <li><strong>Corrigir dados:</strong> Atualizar informações incorretas</li>
              <li><strong>Eliminar dados:</strong> Solicitar exclusão de seus dados</li>
              <li><strong>Portabilidade de dados:</strong> Transferir seus dados para outro serviço</li>
              <li><strong>Informação sobre compartilhamento:</strong> Saber com quem compartilhamos</li>
              <li><strong>Revogar consentimento:</strong> Retirar permissão para uso específico</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              🛡️ 5. Segurança dos Dados
            </h2>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400 ml-4">
              <li><strong>Criptografia:</strong> Todos os dados são criptografados em trânsito e armazenamento</li>
              <li><strong>Acesso Restrito:</strong> Apenas administradores autorizados acessam dados</li>
              <li><strong>Backup Seguro:</strong> Cópia dos dados com proteção adicional</li>
              <li><strong>Monitoramento:</strong> Vigilância constante contra acessos não autorizados</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              ⏰ 6. Retenção de Dados
            </h2>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400 ml-4">
              <li><strong>Dados de Conta:</strong> Mantidos enquanto sua conta estiver ativa</li>
              <li><strong>Dados de Uso:</strong> Mantidos por 2 anos após inatividade</li>
              <li><strong>Dados Financeiros:</strong> Mantidos por 5 anos (obrigação fiscal)</li>
              <li><strong>Exclusão:</strong> Dados permanentemente eliminados após período de retenção</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              🍪 7. Cookies e Tecnologias
            </h2>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400 ml-4">
              <li><strong>Cookies Essenciais:</strong> Para funcionamento básico do sistema</li>
              <li><strong>Cookies de Performance:</strong> Para analisar e melhorar o serviço</li>
              <li><strong>LocalStorage:</strong> Para armazenar preferências e dados offline</li>
              <li><strong>Google Analytics:</strong> Estatísticas anônimas de uso (opcional)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              👶 8. Menores de Idade
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Não coletamos intencionalmente dados de menores de 18 anos sem consentimento dos pais ou responsáveis legais.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              🔄 9. Alterações nesta Política
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Podemos atualizar esta política periodicamente. Mudanças significativas serão comunicadas por email ou aviso no sistema.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              📞 10. Contato DPO (Encarregado de Proteção de Dados)
            </h2>
            
            <div className="bg-slate-50 dark:bg-slate-700/50 p-6 rounded-xl">
              <p className="text-slate-700 dark:text-slate-300 mb-3">
                <strong>Para exercer seus direitos ou tirar dúvidas:</strong>
              </p>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                <li><strong>Email:</strong> privacidade@alego.com.br</li>
                <li><strong>Telefone:</strong> (62) 9xxxx-xxxx</li>
                <li><strong>Resposta em:</strong> Até 15 dias corridos</li>
                <li><strong>Formato de resposta:</strong> Digital ou impressa (sua escolha)</li>
              </ul>
            </div>
          </section>

          <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-xl border border-green-200 dark:border-green-800">
            <h2 className="text-xl font-bold text-green-900 dark:text-green-100 mb-3">
              ✅ Transparência Total
            </h2>
            <p className="text-green-800 dark:text-green-200">
              Temos o compromisso de ser transparentes sobre como usamos seus dados. Se tiver qualquer dúvida, não hesite em entrar em contato!
            </p>
          </div>

          <div className="text-center pt-6 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Última atualização: Março de 2026 | Versão: 1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PoliticaPrivacidade
