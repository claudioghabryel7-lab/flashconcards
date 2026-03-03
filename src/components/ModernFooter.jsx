import { Link } from 'react-router-dom'
import { 
  AcademicCapIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
  RocketLaunchIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

const ModernFooter = () => {
  const currentYear = new Date().getFullYear()

  const footerLinks = {
    produto: [
      { name: 'FlashCards', href: '/flashcards', icon: AcademicCapIcon },
      { name: 'FlashQuestões', href: '/flashquestoes', icon: SparklesIcon },
      { name: 'Simulados', href: '/simulado', icon: ChartBarIcon },
      { name: 'Redação', href: '/treino-redacao', icon: ChatBubbleLeftRightIcon },
    ],
    empresa: [
      { name: 'Sobre Nós', href: '/sobre' },
      { name: 'Planos', href: '/planos' },
      { name: 'Contato', href: '/contato' },
      { name: 'Blog', href: '/blog' },
    ],
    legal: [
      { name: 'Termos de Uso', href: '/termos' },
      { name: 'Política de Privacidade', href: '/politica-privacidade' },
      { name: 'LGPD', href: '/lgpd' },
      { name: 'Cookies', href: '/cookies' },
    ],
    suporte: [
      { name: 'Central de Ajuda', href: '/ajuda' },
      { name: 'FAQ', href: '/faq' },
      { name: 'Contato', href: '/contato' },
      { name: 'Status', href: '/status' },
    ]
  }

  const socialLinks = [
    { name: 'WhatsApp', href: 'https://wa.me/5562981841878', color: 'bg-green-500' },
    { name: 'Instagram', href: '#', color: 'bg-pink-500' },
    { name: 'YouTube', href: '#', color: 'bg-red-500' },
    { name: 'LinkedIn', href: '#', color: 'bg-blue-600' },
  ]

  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
      <div className="container mx-auto px-4 py-12">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand Section */}
          <div className="lg:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl">
                <SparklesIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Flash<span className="text-blue-600">Con</span>Cards
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Edição 2026
                </p>
              </div>
            </div>
            
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
              Plataforma moderna de estudos para concursos públicos com IA avançada, 
              repetição espaçada e analytics inteligentes. Sua aprovação em 2026!
            </p>

            {/* Social Links */}
            <div className="flex space-x-3">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  className={`flex items-center justify-center w-10 h-10 rounded-lg ${social.color} text-white hover:opacity-80 transition-opacity`}
                  title={social.name}
                >
                  <span className="text-xs font-bold">
                    {social.name.charAt(0)}
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Produto</h4>
            <ul className="space-y-3">
              {footerLinks.produto.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <link.icon className="h-4 w-4" />
                    <span className="text-sm">{link.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Empresa</h4>
            <ul className="space-y-3">
              {footerLinks.empresa.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.href}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal & Support */}
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Legal & Suporte</h4>
            <div className="space-y-4">
              <div>
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Legal</h5>
                <ul className="space-y-2">
                  {footerLinks.legal.map((link) => (
                    <li key={link.name}>
                      <Link
                        to={link.href}
                        className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {link.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Suporte</h5>
                <ul className="space-y-2">
                  {footerLinks.suporte.map((link) => (
                    <li key={link.name}>
                      <Link
                        to={link.href}
                        className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {link.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Features Badges */}
        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/20 rounded-full">
              <RocketLaunchIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                Gemini 2.5 Flash
              </span>
            </div>
            
            <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 dark:bg-green-900/20 rounded-full">
              <ShieldCheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-green-800 dark:text-green-200">
                LGPD Compliance
              </span>
            </div>
            
            <div className="flex items-center space-x-2 px-3 py-1 bg-purple-100 dark:bg-purple-900/20 rounded-full">
              <ChartBarIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-xs font-medium text-purple-800 dark:text-purple-200">
                Analytics Avançado
              </span>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              © {currentYear} FlashConCards. Todos os direitos reservados.
            </div>
            
            <div className="flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
              <span>Feito com ❤️ para concurseiros</span>
              <span>•</span>
              <span>Edição 2026</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default ModernFooter
