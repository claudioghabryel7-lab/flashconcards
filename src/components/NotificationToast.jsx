import { useEffect, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const NotificationToast = ({ notifications, onRemove }) => {
  const { darkMode } = useDarkMode()

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2 max-w-sm w-full">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            relative flex items-start gap-3 p-4 rounded-xl shadow-lg border
            animate-slide-in-right
            ${darkMode 
              ? 'bg-slate-800 border-slate-700 text-white' 
              : 'bg-white border-slate-200 text-slate-900'
            }
          `}
        >
          {/* Avatar */}
          {notification.avatar ? (
            <img
              src={notification.avatar}
              alt={notification.userName}
              className="h-10 w-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">
                {notification.userName?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
          )}

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">
              {notification.userName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {notification.message}
            </p>
            {notification.imagePreview && (
              <img
                src={notification.imagePreview}
                alt="Post"
                className="mt-2 w-full h-32 object-cover rounded-lg"
              />
            )}
          </div>

          {/* Botão de fechar */}
          <button
            type="button"
            onClick={() => onRemove(notification.id)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition flex-shrink-0"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      ))}
    </div>
  )
}

export default NotificationToast

