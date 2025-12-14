import { motion } from 'framer-motion'
import { useDarkMode } from '../../hooks/useDarkMode'

const StatsCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  gradient = 'from-blue-500 to-blue-600',
  delay = 0,
  ...props 
}) => {
  const { darkMode } = useDarkMode()
  
  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-slate-200/80 dark:border-slate-700/80"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ scale: 1.02, y: -4 }}
      {...props}
    >
      {/* Gradient Background Effect */}
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} opacity-10 rounded-full blur-2xl`}></div>
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${gradient}`}>
            {Icon && <Icon className="h-6 w-6 text-white" />}
          </div>
        </div>
        
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
          {title}
        </h3>
        
        <p className="text-3xl font-black text-slate-900 dark:text-white mb-1">
          {value}
        </p>
        
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-500">
            {subtitle}
          </p>
        )}
      </div>
    </motion.div>
  )
}

export default StatsCard

































