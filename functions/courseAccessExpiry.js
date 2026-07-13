/**
 * Parse / expiração de acesso a cursos (Cloud Functions).
 */

function normalizeDurationText(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** @returns {{ amount: number, unit: 'years'|'months'|'weeks'|'days' } | null} */
function parseCourseDuration(input) {
  const s = normalizeDurationText(input)
  if (!s) return null

  let m = s.match(/(\d+(?:\.\d+)?)\s*(anos?|meses?|mes|dias?|semanas?)/)
  if (!m) {
    m = s.match(/^(\d+(?:\.\d+)?)$/)
    if (!m) return null
    return { amount: Number(m[1]), unit: 'months' }
  }

  const amount = Number(m[1])
  if (!Number.isFinite(amount) || amount <= 0) return null

  const unitRaw = m[2]
  if (unitRaw.startsWith('ano')) return { amount, unit: 'years' }
  if (unitRaw.startsWith('dia')) return { amount, unit: 'days' }
  if (unitRaw.startsWith('semana')) return { amount, unit: 'weeks' }
  return { amount, unit: 'months' }
}

function addParsedDuration(fromDate, parsed) {
  const d = new Date(fromDate)
  if (parsed.unit === 'years') d.setFullYear(d.getFullYear() + Math.floor(parsed.amount))
  else if (parsed.unit === 'months') d.setMonth(d.getMonth() + Math.floor(parsed.amount))
  else if (parsed.unit === 'weeks') d.setDate(d.getDate() + Math.floor(parsed.amount * 7))
  else if (parsed.unit === 'days') d.setDate(d.getDate() + Math.floor(parsed.amount))
  return d
}

/** Unidade estruturada → label (functions) */
function formatDurationLabel(amount, unit) {
  const n = Math.floor(Number(amount))
  if (!Number.isFinite(n) || n <= 0) return ''
  if (unit === 'days') return n === 1 ? '1 dia' : `${n} dias`
  if (unit === 'years') return n === 1 ? '1 ano' : `${n} anos`
  return n === 1 ? '1 mês' : `${n} meses`
}

function resolveDurationInput(courseOrDuration) {
  if (courseOrDuration && typeof courseOrDuration === 'object') {
    const unit = courseOrDuration.courseDurationUnit
    const value = Number(courseOrDuration.courseDurationValue)
    if (unit && unit !== 'lifetime' && Number.isFinite(value) && value > 0) {
      if (['days', 'months', 'years'].includes(unit)) {
        return { amount: value, unit }
      }
    }
    return parseCourseDuration(courseOrDuration.courseDuration)
  }
  return parseCourseDuration(courseOrDuration)
}

function computeExpiresAt(courseOrDuration, fromDate = new Date()) {
  const parsed = resolveDurationInput(courseOrDuration)
  if (!parsed) return null
  return addParsedDuration(fromDate, parsed)
}

function entitlementId(userId, courseId) {
  return `${userId}_${courseId}`
}

/**
 * Concede / renova acesso ao curso no perfil + coleção courseEntitlements.
 */
async function grantCourseAccess(db, FieldValue, {
  userId,
  courseId,
  courseDuration = null,
  courseDurationUnit = null,
  courseDurationValue = null,
  autoRenew = false,
  paymentMethod = null,
  transactionId = null,
  amount = null,
  extendFromCurrent = false,
  preapprovalId = null,
}) {
  if (!userId || !courseId) return null

  const userRef = db.collection('users').doc(userId)
  const entRef = db.collection('courseEntitlements').doc(entitlementId(userId, courseId))
  const now = new Date()

  const entSnap = await entRef.get()
  const prev = entSnap.exists ? entSnap.data() : null

  let base = now
  if (extendFromCurrent && prev?.expiresAt) {
    const prevExp = prev.expiresAt.toDate ? prev.expiresAt.toDate() : new Date(prev.expiresAt)
    if (prevExp > base) base = prevExp
  }

  const durationSource = {
    courseDuration: courseDuration || prev?.courseDuration || null,
    courseDurationUnit: courseDurationUnit || prev?.courseDurationUnit || null,
    courseDurationValue:
      courseDurationValue != null ? courseDurationValue : prev?.courseDurationValue ?? null,
  }
  const expiresAtDate = computeExpiresAt(durationSource, base)
  const expiresAt = expiresAtDate ? expiresAtDate : null
  const canAutoRenew = Boolean(autoRenew && expiresAt && paymentMethod === 'card')
  const durationLabel =
    formatDurationLabel(durationSource.courseDurationValue, durationSource.courseDurationUnit) ||
    durationSource.courseDuration ||
    null

  const accessPayload = {
    purchasedAt: prev?.purchasedAt || FieldValue.serverTimestamp(),
    renewedAt: FieldValue.serverTimestamp(),
    expiresAt: expiresAt || null,
    lifetime: !expiresAt,
    autoRenew: canAutoRenew,
    paymentMethod: paymentMethod || prev?.paymentMethod || null,
    lastTransactionId: transactionId || prev?.lastTransactionId || null,
    courseDuration: durationLabel,
    courseDurationUnit: durationSource.courseDurationUnit || null,
    courseDurationValue: durationSource.courseDurationValue || null,
    amount: typeof amount === 'number' ? amount : prev?.amount || null,
    preapprovalId: preapprovalId || prev?.preapprovalId || null,
    status: 'active',
  }

  await entRef.set(
    {
      userId,
      courseId,
      ...accessPayload,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: prev?.createdAt || FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  const userSnap = await userRef.get()
  const userData = userSnap.exists ? userSnap.data() : {}
  const purchased = Array.isArray(userData.purchasedCourses) ? [...userData.purchasedCourses] : []
  if (!purchased.includes(courseId)) purchased.push(courseId)

  await userRef.set(
    {
      purchasedCourses: purchased,
      hasActiveSubscription: true,
      lastPaymentDate: FieldValue.serverTimestamp(),
      [`courseAccess.${courseId}`]: accessPayload,
      ...(courseId && !userData.selectedCourseId ? { selectedCourseId: courseId } : {}),
      ...(!userData.subscriptionStartDate
        ? { subscriptionStartDate: FieldValue.serverTimestamp() }
        : {}),
    },
    { merge: true },
  )

  return { expiresAt, lifetime: !expiresAt, autoRenew: canAutoRenew }
}

async function revokeCourseAccess(db, FieldValue, { userId, courseId, reason = 'expired' }) {
  if (!userId || !courseId) return

  const userRef = db.collection('users').doc(userId)
  const entRef = db.collection('courseEntitlements').doc(entitlementId(userId, courseId))

  await entRef.set(
    {
      status: 'expired',
      expiredAt: FieldValue.serverTimestamp(),
      expireReason: reason,
      autoRenew: false,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  const userSnap = await userRef.get()
  if (!userSnap.exists) return
  const data = userSnap.data() || {}
  const purchased = (data.purchasedCourses || []).filter((id) => id !== courseId)
  const selectedCourseId = data.selectedCourseId === courseId ? null : data.selectedCourseId

  await userRef.set(
    {
      purchasedCourses: purchased,
      selectedCourseId,
      [`courseAccess.${courseId}.status`]: 'expired',
      [`courseAccess.${courseId}.expiredAt`]: FieldValue.serverTimestamp(),
      [`courseAccess.${courseId}.autoRenew`]: false,
      [`courseAccess.${courseId}.expireReason`]: reason,
    },
    { merge: true },
  )
}

function toMercadoPagoRecurring(courseOrDuration) {
  const parsed = resolveDurationInput(courseOrDuration)
  if (!parsed) return null
  if (parsed.unit === 'years') {
    return { frequency: Math.max(1, Math.floor(parsed.amount * 12)), frequency_type: 'months' }
  }
  if (parsed.unit === 'months') {
    return { frequency: Math.max(1, Math.floor(parsed.amount)), frequency_type: 'months' }
  }
  if (parsed.unit === 'weeks') {
    return { frequency: Math.max(1, Math.floor(parsed.amount * 7)), frequency_type: 'days' }
  }
  return { frequency: Math.max(1, Math.floor(parsed.amount)), frequency_type: 'days' }
}

module.exports = {
  parseCourseDuration,
  computeExpiresAt,
  addParsedDuration,
  entitlementId,
  grantCourseAccess,
  revokeCourseAccess,
  toMercadoPagoRecurring,
}
