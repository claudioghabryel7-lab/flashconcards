import { motion } from 'framer-motion'

const TabNavigation = ({ tabs, activeTab, onTabChange, className = '' }) => {
  return (
    <div className={`flex flex-wrap gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              relative px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300
              ${isActive 
                ? 'text-white' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }
            `}
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-gradient-to-r from-alego-600 to-alego-700 rounded-lg"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {tab.icon && <tab.icon className="h-4 w-4" />}
              {tab.label}
              {tab.badge && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-white/20">
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default TabNavigation


















