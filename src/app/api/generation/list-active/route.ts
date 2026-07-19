import { createRequire } from 'module'
import { backendGetPost } from '@/lib/server/backendRoute'

const require = createRequire(import.meta.url)
const handlers = require('../../../../../server/api/handlersIndex.cjs')

export const maxDuration = 120

export const { GET, POST } = backendGetPost(handlers.handleListActiveGenerationJobs)
