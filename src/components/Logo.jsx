import React from 'react'

const Logo = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: { width: 32, height: 32, fontSize: 'text-lg' },
    md: { width: 40, height: 40, fontSize: 'text-xl' },
    lg: { width: 48, height: 48, fontSize: 'text-2xl' },
    xl: { width: 64, height: 64, fontSize: 'text-3xl' }
  }

  const { width, height, fontSize } = sizes[size] || sizes.md

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-lg"
      >
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff6b35" />
            <stop offset="50%" stopColor="#00f0ff" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="logoGradient2" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff6b35" />
            <stop offset="100%" stopColor="#00f0ff" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Hexagon background */}
        <path
          d="M32 4L58 20V44L32 60L6 44V20L32 4Z"
          fill="url(#logoGradient)"
          opacity="0.1"
        />
        
        {/* Main hexagon */}
        <path
          d="M32 8L56 22V42L32 56L8 42V22L32 8Z"
          fill="url(#logoGradient)"
          filter="url(#glow)"
        />
        
        {/* Inner design - C letter */}
        <path
          d="M24 20V44H28V34H36C38.2 34 40 32.2 40 30V24C40 21.8 38.2 20 36 20H24ZM28 24H36V30H28V24Z"
          fill="white"
        />
        
        {/* Accent dots */}
        <circle cx="44" cy="20" r="3" fill="url(#logoGradient2)" />
        <circle cx="20" cy="44" r="2" fill="url(#logoGradient2)" />
        
        {/* Futuristic lines */}
        <path
          d="M32 8V4M32 60V56M58 22L62 20M58 42L62 44M6 22L2 20M6 42L2 44"
          stroke="url(#logoGradient)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      
      <div className="flex flex-col">
        <span className={`font-bold ${fontSize} gradient-text leading-tight`}>
          ConCursos
        </span>
        <span className="text-xs font-semibold text-accent-orange">
          2.5
        </span>
      </div>
    </div>
  )
}

export default Logo
