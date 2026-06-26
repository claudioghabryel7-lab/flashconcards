import React from 'react'

const Logo = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: { width: 300, height: 300 },
    md: { width: 360, height: 360 },
    lg: { width: 420, height: 420 },
    xl: { width: 480, height: 480 }
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
          opacity: '1'
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
