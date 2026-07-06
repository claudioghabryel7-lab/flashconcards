import UserAvatar from '../UserAvatar'

const ringSizes = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
}

const avatarSizes = {
  sm: 'xs',
  md: 'md',
  lg: 'lg',
}

export default function FeedStoryAvatar({
  photoBase64,
  name,
  size = 'md',
  hasStory = true,
  seen = false,
  className = '',
}) {
  const dim = ringSizes[size] || ringSizes.md
  const avatarSize = avatarSizes[size] || avatarSizes.md

  if (!hasStory) {
    return <UserAvatar photoBase64={photoBase64} name={name} size={size} className={className} />
  }

  const ringClass = seen
    ? 'bg-cp-border'
    : 'bg-gradient-to-tr from-amber-400 via-rose-500 to-purple-600'

  return (
    <div className={`${dim} shrink-0 rounded-full ${ringClass} p-[2.5px] ${className}`}>
      <div className="flex h-full w-full items-center justify-center rounded-full bg-cp-surface p-[2px]">
        <UserAvatar
          photoBase64={photoBase64}
          name={name}
          size={avatarSize}
          className="!border-0"
        />
      </div>
    </div>
  )
}
