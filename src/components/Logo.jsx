import React from 'react'

const Logo = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: { width: 120, height: 120 },
    md: { width: 140, height: 140 },
    lg: { width: 160, height: 160 },
    xl: { width: 180, height: 180 }
  }

  const { width, height } = sizes[size] || sizes.md

  return (
    <div className={`flex items-center ${className}`}>
      <img
        src="/course-icons/logosite.png"
        alt="ConCursos Logo"
        width={width}
        height={height}
        className="object-contain"
        style={{
          filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4)) brightness(1.1) contrast(1.1)',
          opacity: '1',
          maxWidth: '100%',
          height: 'auto'
        }}
        onError={(e) => {
          e.target.src = '/course-icons/logosite.jpg';
          e.target.onerror = () => {
            e.target.src = '/course-icons/logosite.svg';
          };
        }}
      />
    </div>
  )
}

export default Logo
