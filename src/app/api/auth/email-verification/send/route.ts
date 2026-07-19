import { createRequire } from 'module'
import { backendRoute } from '@/lib/server/backendRoute'

const require = createRequire(import.meta.url)
const handlers = require('../../../../../../server/api/handlersIndex.cjs')

export const POST = backendRoute(handlers.handleSendEmailVerificationCode)
