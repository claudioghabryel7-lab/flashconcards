import { SparklesIcon } from '@heroicons/react/24/outline'

const ModernLoading = ({ size = 'md', text = 'Carregando...' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      {/* Animated Logo */}
      <div className="relative">
        <div className={`animate-pulse ${sizeClasses[size]}`}>
          <SparklesIcon className="h-full w-full text-blue-600" />
        </div>
        
        {/* Orbiting dots */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1 h-1 bg-blue-600 rounded-full animate-ping"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1 h-1 bg-purple-600 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1 h-1 bg-pink-600 rounded-full animate-ping" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading Text */}
      <div className="text-center">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 animate-pulse">
          {text}
        </p>
        
        {/* Progress dots */}
        <div className="flex items-center justify-center space-x-1 mt-2">
          <div className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
          <div className="w-1 h-1 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
          <div className="w-1 h-1 bg-pink-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
        </div>
      </div>
    </div>
  )
}

export default ModernLoading
