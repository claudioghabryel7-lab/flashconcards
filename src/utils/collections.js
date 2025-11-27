// Helper para obter nomes de coleções baseado no sistema
export const getCollectionName = (baseName, system = 'alego') => {
  if (system === 'pmgo') {
    return `${baseName}_pmgo`
  }
  return baseName
}

// Coleções principais
export const COLLECTIONS = {
  flashcards: (system) => getCollectionName('flashcards', system),
  userProgress: (system) => getCollectionName('userProgress', system),
  progress: (system) => getCollectionName('progress', system),
  users: (system) => getCollectionName('users', system),
  config: (system) => getCollectionName('config', system),
}

