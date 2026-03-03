import { forwardRef } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../utils/cn'

const cardVariants = cva(
  'rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'border-gray-200 dark:border-gray-700',
        elevated: 'border-gray-200 dark:border-gray-700 shadow-md hover:shadow-lg',
        outlined: 'border-2 border-gray-300 dark:border-gray-600',
        ghost: 'border-transparent bg-gray-50 dark:bg-gray-800/50',
        success: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20',
        warning: 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20',
        error: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
      },
      size: {
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
        xl: 'p-10',
      },
      interactive: {
        true: 'hover:shadow-md hover:-translate-y-1 cursor-pointer',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      interactive: false,
    },
  }
)

const ModernCard = forwardRef(({ className, variant, size, interactive, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, size, interactive, className }))}
      {...props}
    >
      {children}
    </div>
  )
})

ModernCard.displayName = 'ModernCard'

// Card Header Component
const ModernCardHeader = forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    >
      {children}
    </div>
  )
})

ModernCardHeader.displayName = 'ModernCardHeader'

// Card Title Component
const ModernCardTitle = forwardRef(({ className, children, ...props }, ref) => {
  return (
    <h3
      ref={ref}
      className={cn('text-2xl font-semibold leading-none tracking-tight', className)}
      {...props}
    >
      {children}
    </h3>
  )
})

ModernCardTitle.displayName = 'ModernCardTitle'

// Card Description Component
const ModernCardDescription = forwardRef(({ className, children, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn('text-sm text-gray-600 dark:text-gray-400', className)}
      {...props}
    >
      {children}
    </p>
  )
})

ModernCardDescription.displayName = 'ModernCardDescription'

// Card Content Component
const ModernCardContent = forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('p-6 pt-0', className)}
      {...props}
    >
      {children}
    </div>
  )
})

ModernCardContent.displayName = 'ModernCardContent'

// Card Footer Component
const ModernCardFooter = forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    >
      {children}
    </div>
  )
})

ModernCardFooter.displayName = 'ModernCardFooter'

export {
  ModernCard,
  ModernCardHeader,
  ModernCardTitle,
  ModernCardDescription,
  ModernCardContent,
  ModernCardFooter,
}
