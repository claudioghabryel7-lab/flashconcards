import { Link } from 'react-router-dom'
import { AcademicCapIcon, BookOpenIcon, SparklesIcon, RocketLaunchIcon, CalendarIcon, UsersIcon, DocumentTextIcon } from '@heroicons/react/24/solid'

const Demo = () => {
  return (
    <div className="min-h-screen py-16 sm:py-20 md:py-24">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border-primary bg-background-card text-xs font-semibold text-accent-cyan">
            <RocketLaunchIcon className="h-4 w-4" />
            Demo Interativa
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-text-primary">
            Conheça nossa
            <span className="block gradient-text">
              Plataforma
            </span>
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Veja como funciona o sistema completo de estudo para concursos públicos
          </p>
        </div>

        {/* Demo Sections */}
        <div className="space-y-12">
          {/* Dashboard Section */}
          <div className="bg-background-card border border-border-primary rounded-2xl p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-accent-orange to-accent-cyan flex items-center justify-center">
                <AcademicCapIcon className="h-6 w-6 text-background-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-text-primary">Dashboard</h2>
                <p className="text-sm text-text-secondary">Visão geral do seu progresso</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-background-primary border border-border-primary rounded-xl p-4 text-center">
                <div className="text-3xl font-black gradient-text">85%</div>
                <div className="text-xs text-text-secondary mt-1">Progresso</div>
              </div>
              <div className="bg-background-primary border border-border-primary rounded-xl p-4 text-center">
                <div className="text-3xl font-black gradient-text">1.2k</div>
                <div className="text-xs text-text-secondary mt-1">Flashcards</div>
              </div>
              <div className="bg-background-primary border border-border-primary rounded-xl p-4 text-center">
                <div className="text-3xl font-black gradient-text">45</div>
                <div className="text-xs text-text-secondary mt-1">Questões</div>
              </div>
              <div className="bg-background-primary border border-border-primary rounded-xl p-4 text-center">
                <div className="text-3xl font-black gradient-text">12</div>
                <div className="text-xs text-text-secondary mt-1">Dias Streak</div>
              </div>
            </div>
          </div>

          {/* Edital Verticalizado Section */}
          <div className="bg-background-card border border-border-primary rounded-2xl p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-accent-cyan to-blue-600 flex items-center justify-center">
                <DocumentTextIcon className="h-6 w-6 text-background-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-text-primary">Edital Verticalizado</h2>
                <p className="text-sm text-text-secondary">Conteúdo organizado por tópicos</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="bg-background-primary border border-border-primary rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-accent-orange/20 flex items-center justify-center">
                    <BookOpenIcon className="h-4 w-4 text-accent-orange" />
                  </div>
                  <div>
                    <div className="font-semibold text-text-primary">Direito Constitucional</div>
                    <div className="text-xs text-text-secondary">45 tópicos • 120 flashcards</div>
                  </div>
                </div>
                <SparklesIcon className="h-5 w-5 text-accent-cyan" />
              </div>
              <div className="bg-background-primary border border-border-primary rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-accent-cyan/20 flex items-center justify-center">
                    <BookOpenIcon className="h-4 w-4 text-accent-cyan" />
                  </div>
                  <div>
                    <div className="font-semibold text-text-primary">Direito Penal</div>
                    <div className="text-xs text-text-secondary">38 tópicos • 98 flashcards</div>
                  </div>
                </div>
                <SparklesIcon className="h-5 w-5 text-accent-orange" />
              </div>
              <div className="bg-background-primary border border-border-primary rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-accent-orange/20 flex items-center justify-center">
                    <BookOpenIcon className="h-4 w-4 text-accent-orange" />
                  </div>
                  <div>
                    <div className="font-semibold text-text-primary">Direito Administrativo</div>
                    <div className="text-xs text-text-secondary">52 tópicos • 145 flashcards</div>
                  </div>
                </div>
                <SparklesIcon className="h-5 w-5 text-accent-cyan" />
              </div>
            </div>
          </div>

          {/* Flashcards Section */}
          <div className="bg-background-card border border-border-primary rounded-2xl p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-accent-orange to-accent-cyan flex items-center justify-center">
                <SparklesIcon className="h-6 w-6 text-background-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-text-primary">Flashcards com IA</h2>
                <p className="text-sm text-text-secondary">Sistema de repetição espaçada</p>
              </div>
            </div>
            <div className="bg-background-primary border border-border-primary rounded-xl p-6">
              <div className="text-center space-y-4">
                <div className="text-lg font-semibold text-text-primary">O que é o princípio da legalidade?</div>
                <div className="text-sm text-text-secondary">
                  O princípio da legalidade estabelece que ninguém será obrigado a fazer ou deixar de fazer alguma coisa senão em virtude de lei.
                </div>
                <div className="flex justify-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-accent-orange"></div>
                  <div className="w-3 h-3 rounded-full bg-border-primary"></div>
                  <div className="w-3 h-3 rounded-full bg-border-primary"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Calendário Section */}
          <div className="bg-background-card border border-border-primary rounded-2xl p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-accent-cyan to-blue-600 flex items-center justify-center">
                <CalendarIcon className="h-6 w-6 text-background-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-text-primary">Calendário de Progresso</h2>
                <p className="text-sm text-text-secondary">Acompanhe sua evolução</p>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                <div key={i} className="text-center text-xs text-text-secondary font-semibold py-2">{day}</div>
              ))}
              {[...Array(35)].map((_, i) => (
                <div key={i} className={`aspect-square rounded-lg flex items-center justify-center text-sm font-semibold ${
                  i < 5 ? 'bg-border-primary/30 text-text-secondary' :
                  i % 7 === 0 || i % 7 === 6 ? 'bg-background-primary text-text-secondary' :
                  i % 3 === 0 ? 'bg-accent-orange text-background-primary' :
                  'bg-accent-cyan text-background-primary'
                }`}>
                  {i < 5 ? '' : i - 4}
                </div>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center space-y-6 py-12">
            <h2 className="text-3xl sm:text-4xl font-black text-text-primary">
              Pronto para começar?
            </h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">
              Junte-se a centenas de alunos que já estão se preparando para seus concursos
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                to="/cursos"
                className="group relative inline-flex items-center justify-center gap-2 bg-gradient-to-r from-accent-orange to-accent-cyan text-background-primary px-8 py-4 rounded-lg font-bold text-base sm:text-lg transition-all hover:shadow-glow hover:scale-105"
              >
                <AcademicCapIcon className="h-5 w-5" />
                Ver Cursos
              </Link>
              <Link
                to="/login"
                className="group relative inline-flex items-center justify-center gap-2 bg-gradient-to-r from-accent-cyan to-blue-600 text-background-primary px-8 py-4 rounded-lg font-bold text-base sm:text-lg transition-all hover:shadow-glow hover:scale-105"
              >
                <RocketLaunchIcon className="h-5 w-5" />
                Criar Conta
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Demo
