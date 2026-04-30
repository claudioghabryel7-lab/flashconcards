'use client'

import { useState, useEffect } from 'react'
import { Menu, X, Brain, Sparkles, ArrowRight } from 'lucide-react'

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navigation = [
    { name: 'Início', href: '#home' },
    { name: 'Recursos', href: '#features' },
    { name: 'Como Funciona', href: '#how-it-works' },
    { name: 'Preços', href: '#pricing' },
    { name: 'Contato', href: '#contact' }
  ]

  return (
    <>
      <header className={`fixed top-0 w-full z-50 transition-all duration-500 ${
        isScrolled 
          ? 'bg-white/10 backdrop-blur-xl border-b border-white/10 shadow-glow' 
          : 'bg-transparent'
      }`}>
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo with animation */}
            <div className="flex items-center group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary-400 to-accent-400 rounded-lg blur-lg opacity-75 group-hover:opacity-100 transition-opacity duration-300 animate-pulse-slow" />
                <div className="relative flex items-center space-x-3 bg-white/10 backdrop-blur-md rounded-lg px-4 py-2 border border-white/20">
                  <Brain className="h-8 w-8 text-white group-hover:animate-bounce-subtle transition-colors" />
                  <span className="text-xl font-bold text-white font-display">FlashConCards</span>
                </div>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-1">
              {navigation.map((item, index) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="relative text-white/80 hover:text-white px-4 py-2 rounded-lg transition-all duration-300 group"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <span className="relative z-10 font-medium">{item.name}</span>
                  <div className="absolute inset-0 bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform scale-95 group-hover:scale-100" />
                </a>
              ))}
            </div>

            {/* CTA Button */}
            <div className="hidden lg:flex items-center">
              <button className="group relative overflow-hidden bg-gradient-to-r from-primary-500 to-accent-500 text-white px-8 py-3 rounded-full font-semibold transition-all duration-300 hover:scale-105 hover:shadow-glow-lg">
                <div className="absolute inset-0 bg-gradient-to-r from-accent-500 to-primary-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10 flex items-center">
                  Começar Gratuitamente
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                </span>
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="lg:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="text-white/80 hover:text-white p-2 rounded-lg transition-colors duration-300"
              >
                {isMenuOpen ? (
                  <X className="h-6 w-6 animate-scale-in" />
                ) : (
                  <Menu className="h-6 w-6 animate-scale-in" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <div className="lg:hidden mt-4 animate-fade-in-up">
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-4">
                {navigation.map((item, index) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className="block text-white/80 hover:text-white px-4 py-3 rounded-lg hover:bg-white/10 transition-all duration-300 font-medium"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.name}
                  </a>
                ))}
                <div className="pt-4 mt-4 border-t border-white/20">
                  <button className="w-full bg-gradient-to-r from-primary-500 to-accent-500 text-white px-6 py-3 rounded-full font-semibold hover:shadow-glow transition-all duration-300">
                    Começar Gratuitamente
                  </button>
                </div>
              </div>
            </div>
          )}
        </nav>
      </header>
    </>
  )
}
