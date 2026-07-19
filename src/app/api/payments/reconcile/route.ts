import { createRequire } from 'module'
import { backendRoute } from '@/lib/server/backendRoute'

const require = createRequire(import.meta.url)
const handlers = require('../../../../../server/api/handlersIndex.cjs')
const { getMercadoPagoAccessToken } = require('../../../../../functions/mercadopagoConfig')
const { getAdmin } = require('../../../../../server/admin/initFirebaseAdmin.cjs')

export const maxDuration = 60

export const POST = backendRoute(handlers.handleReconcilePayment, {
  getMercadoPagoAccessToken,
  admin: getAdmin(),
  functions: { config: () => ({}) },
})
