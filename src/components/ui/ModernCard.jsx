import { useDarkMode } from '../../hooks/useDarkMode'

const ModernCard = ({ 
  children, 
  className = '', 
  hover = true, 
  gradient = false,
  glass = false,
  ...props 
}) => {
  const { darkMode } = useDarkMode()
  
  const baseClasses = `
    rounded-2xl p-6
    ${glass 
      ? 'bg-white/10 dark:bg-slate-800/30 backdrop-blur-xl border border-white/20 dark:border-slate-700/30' 
      : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80'
    }
    shadow-lg dark:shadow-xl
    transition-all duration-300
    ${hover ? 'hover:shadow-2xl hover:-translate-y-1 hover:scale-102 active:scale-98' : ''}
    ${gradient ? 'bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900' : ''}
    ${className}
    animate-fade-in-up
    transform-gpu
    will-change-transform
  `
  
  return (
    <div 
      className={baseClasses}
      style={{
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export default ModernCard












































