import { UserCircle } from 'lucide-react'

const sizes = {
  xs: 'h-7 w-7',
  sm: 'h-9 w-9',
  md: 'h-12 w-12',
  lg: 'h-20 w-20',
}

const iconSizes = {
  xs: 'h-4 w-4',
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
}

export default function UserAvatar({
  photoBase64,
  name = '',
  size = 'sm',
  className = '',
}) {
  const dim = sizes[size] || sizes.sm
  const icon = iconSizes[size] || iconSizes.sm

  if (photoBase64) {
    return (
      <img
        src={photoBase64}
        alt={name || 'Foto de perfil'}
        className={`${dim} shrink-0 rounded-full object-cover border border-cp-border ${className}`}
      />
    )
  }

  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-cp-accent/15 ${className}`}
    >
      <UserCircle className={`${icon} text-cp-accent`} />
    </div>
  )
}
