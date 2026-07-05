export const CONTENT_STATUS = {
  AVAILABLE: 'disponivel',
  UNAVAILABLE: 'indisponivel',
}

export const isContentAvailable = (status, isAdmin = false) =>
  isAdmin || status === CONTENT_STATUS.AVAILABLE

export const toggleContentStatus = (current) =>
  current === CONTENT_STATUS.AVAILABLE
    ? CONTENT_STATUS.UNAVAILABLE
    : CONTENT_STATUS.AVAILABLE

export const defaultContentStatus = () => CONTENT_STATUS.UNAVAILABLE
