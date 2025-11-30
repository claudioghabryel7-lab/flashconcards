import { motion } from 'framer-motion'

const GradientButton = ({ 
  children, 
  onClick, 
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  ...props 
}) => {
  const variants = {
    primary: 'from-alego-600 to-alego-700 hover:from-alego-700 hover:to-alego-800',
    success: 'from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700',
    danger: 'from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700',
    purple: 'from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700',
    tech: 'from-tech-500 to-tech-600 hover:from-tech-600 hover:to-tech-700',
  }
  
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  }
  
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={`
        rounded-xl
        bg-gradient-to-r ${variants[variant]}
        text-white font-semibold
        shadow-lg hover:shadow-xl
        transition-all duration-300
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizes[size]}
        ${className}
      `}
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      {...props}
    >
      {children}
    </motion.button>
  )
}

export default GradientButton


