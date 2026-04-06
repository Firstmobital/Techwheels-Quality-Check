import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  format,
  isToday,
  isTomorrow,
  differenceInDays,
  parseISO,
  isWithinInterval,
  addHours,
} from 'date-fns'
import type {
  CarStatus,
  DeliveryDateStatus,
  MatchedStock,
  TransferTask,
} from '@/types'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

// ── Tailwind class merger ─────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Date helpers ──────────────────────────────────────────────────────────────
export function fmtDate(date: string | null | undefined): string {
  if (!date) return '—'
  try {
    return format(parseISO(date), 'd MMM yyyy')
  } catch {
    return date
  }
}

export function fmtTime(time: string | null | undefined): string {
  if (!time) return '—'
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

export function fmtDateTime(
  date: string | null,
  time: string | null,
): string {
  if (!date) return '—'
  return `${fmtDate(date)}${time ? ', ' + fmtTime(time) : ''}`
}

export function getDeliveryStatus(
  date: string | null | undefined,
): DeliveryDateStatus {
  if (!date) return null
  try {
    const d = parseISO(date)
    const diff = differenceInDays(d, new Date())
    if (diff < 0) return 'overdue'
    if (isToday(d)) return 'today'
    if (isTomorrow(d)) return 'tomorrow'
    if (diff <= 7) return 'this_week'
    return 'future'
  } catch {
    return null
  }
}

export function deliveryStatusLabel(status: DeliveryDateStatus): string {
  switch (status) {
    case 'today':     return 'आज'
    case 'tomorrow':  return 'कल'
    case 'overdue':   return 'देरी'
    case 'this_week': return 'इस हफ्ते'
    case 'future':    return 'आगामी'
    default:          return '—'
  }
}

export function isWithin48Hours(
  date: string | null | undefined,
): boolean {
  if (!date) return false
  try {
    const d = parseISO(date)
    const now = new Date()
    return isWithinInterval(d, { start: now, end: addHours(now, 48) })
  } catch {
    return false
  }
}

// ── Customer name ─────────────────────────────────────────────────────────────
export function customerName(
  row: Pick<MatchedStock, 'first_name' | 'last_name'>,
): string {
  return (
    [row.first_name, row.last_name].filter(Boolean).join(' ') || '—'
  )
}

// ── Initials ──────────────────────────────────────────────────────────────────
export function initials(first: string, last?: string | null): string {
  return (
    first.charAt(0).toUpperCase() +
    (last ? last.charAt(0).toUpperCase() : '')
  )
}

// ── WhatsApp URL ──────────────────────────────────────────────────────────────
export function buildWhatsAppUrl(
  phone: string,
  message: string,
): string {
  const cleaned = phone.replace(/\D/g, '')
  const withCountry = cleaned.startsWith('91')
    ? cleaned
    : `91${cleaned}`
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`
}

// ── Truncate ──────────────────────────────────────────────────────────────────
export function truncate(
  str: string | null | undefined,
  n: number,
): string {
  if (!str) return '—'
  return str.length > n ? str.slice(0, n) + '…' : str
}

// ── Normalize helper for name matching ───────────────────────────────────────
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // collapse multiple spaces into one
}

// ── Sales team → delivery branch map ─────────────────────────────────────────
/**
 * Returns Map<normalizedFullName, locationName>
 *
 * Chain: matched_stock.sales_team = "First Last"
 *   → employees row with matching first_name + last_name (case-insensitive)
 *   → employees.location_id
 *   → locations.name  =  delivery branch
 *
 * Keys are stored normalized (lowercase, trimmed, single-spaced) so that
 * lookups via getSalesTeamLocation() are also normalized, avoiding mismatches
 * caused by different casing or extra whitespace between the two tables.
 */
export async function buildSalesTeamMap(): Promise<Map<string, string>> {
  const supabase = getSupabaseBrowserClient()

  const { data, error } = await supabase
    .from('employees')
    .select('first_name, last_name, location:locations!employees_location_id_fkey(name)')

  if (error || !data) {
    console.error('[buildSalesTeamMap] query failed:', error?.message)
    return new Map()
  }

  const map = new Map<string, string>()

  for (const emp of data as unknown as Array<{
    first_name: string
    last_name: string | null
    location: { name: string } | null
  }>) {
    const fullName = [emp.first_name, emp.last_name]
      .filter(Boolean)
      .join(' ')
      .trim()

    if (fullName && emp.location?.name) {
      // Store with normalized key so lookups always match regardless of
      // casing / spacing differences between sales_team and employee names
      const normalizedKey = normalizeName(fullName)
      map.set(normalizedKey, emp.location.name)

      // Also log during development so mismatches are easy to spot
      console.debug(
        `[buildSalesTeamMap] "${fullName}" → "${emp.location.name}" (key: "${normalizedKey}")`,
      )
    }
  }

  return map
}

/**
 * Look up delivery branch from a sales_team string.
 * Normalizes the input the same way buildSalesTeamMap does.
 */
export function getSalesTeamLocation(
  map: Map<string, string>,
  salesTeam: string | null | undefined,
): string | null {
  if (!salesTeam) return null
  return map.get(normalizeName(salesTeam)) ?? null
}

// ── Car status derivation ─────────────────────────────────────────────────────
/**
 * Full status chain:
 *
 * 1. No delivery branch known            → qc_pending (can't determine transfer)
 * 2. Car not at delivery branch
 *    a. No transfer task                 → transfer_needed
 *    b. Transfer assigned                → transfer_assigned
 *    c. Transfer picked up               → in_transit
 *    d. Transfer arrived                 → treat as at_branch, fall through
 * 3. Car at delivery branch (or arrived)
 *    a. No QC record                     → qc_pending
 *    b. QC rejected/failed               → qc_rejected
 *    c. QC approved/completed            → ready (if delivery date set) or qc_approved
 */
export function deriveCarStatus(
  currentLocation: string | null,
  deliveryBranch: string | null,
  transfer: TransferTask | null,
  qcStatus: string | null,
  deliveryDate: string | null,
): CarStatus {
  // No delivery branch — can't route, show as pending
  if (!deliveryBranch) {
    if (!qcStatus) return 'qc_pending'
    if (qcStatus === 'rejected' || qcStatus === 'failed') return 'qc_rejected'
    if (qcStatus === 'approved' || qcStatus === 'completed')
      return deliveryDate ? 'ready' : 'qc_approved'
    return 'qc_pending'
  }

  const atBranch =
    currentLocation === deliveryBranch ||
    transfer?.status === 'arrived'

  if (!atBranch) {
    if (!transfer) return 'transfer_needed'
    if (transfer.status === 'assigned') return 'transfer_assigned'
    if (transfer.status === 'picked_up') return 'in_transit'
    // arrived handled above via atBranch
    return 'transfer_assigned'
  }

  // At branch — check QC
  if (!qcStatus) return 'qc_pending'
  if (qcStatus === 'rejected' || qcStatus === 'failed') return 'qc_rejected'
  if (qcStatus === 'approved' || qcStatus === 'completed')
    return deliveryDate ? 'ready' : 'qc_approved'

  return 'qc_pending'
}

// ── Car status display helpers ────────────────────────────────────────────────
export function carStatusLabel(status: CarStatus): string {
  switch (status) {
    case 'transfer_needed':   return 'ट्रांसफर जरूरी'
    case 'transfer_assigned': return 'ड्राइवर मिला'
    case 'in_transit':        return 'रास्ते में'
    case 'at_branch':         return 'ब्रांच पर'
    case 'qc_pending':        return 'QC बाकी'
    case 'qc_approved':       return 'QC पास'
    case 'qc_rejected':       return 'QC फेल'
    case 'ready':             return 'तैयार'
  }
}

export function carStatusBadgeClass(status: CarStatus): string {
  switch (status) {
    case 'transfer_needed':   return 'badge-amber'
    case 'transfer_assigned': return 'badge-amber'
    case 'in_transit':        return 'badge-blue'
    case 'at_branch':         return 'badge-gray'
    case 'qc_pending':        return 'badge-purple'
    case 'qc_approved':       return 'badge-green'
    case 'qc_rejected':       return 'badge-red'
    case 'ready':             return 'badge-green'
  }
}

// ── Ageing class ──────────────────────────────────────────────────────────────
export function ageingClass(days: number | null): string {
  if (days === null) return 'text-slate-400'
  if (days <= 15) return 'text-emerald-600 bg-emerald-50'
  if (days <= 30) return 'text-amber-600 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

export function faultSeverityLabel(severity: string): string {
  switch (severity) {
    case 'minor': return 'छोटी'
    case 'major': return 'बड़ी'
    case 'critical': return 'गंभीर'
    default: return '—'
  }
}

export function faultStatusLabel(status: string): string {
  switch (status) {
    case 'open': return 'खुली'
    case 'in_progress': return 'काम जारी'
    case 'resolved': return 'ठीक हो गई'
    case 'verified': return 'जांची गई'
    default: return '—'
  }
}

export function concernCategoryLabel(category: string): string {
  switch (category) {
    case 'delivery_delay': return 'डिलीवरी देरी'
    case 'vehicle_condition': return 'गाड़ी की हालत'
    case 'documentation': return 'कागज़ात'
    case 'yard_capacity': return 'यार्ड क्षमता'
    case 'ev_charging': return 'EV चार्जिंग'
    case 'vehicle_missing': return 'गाड़ी गायब'
    case 'safety': return 'सुरक्षा'
    case 'other': return 'अन्य'
    default: return '—'
  }
}

export function concernStatusLabel(status: string): string {
  switch (status) {
    case 'open': return 'खुली'
    case 'seen': return 'देखी गई'
    case 'resolved': return 'हल हुई'
    case 'rejected': return 'खारिज'
    default: return '—'
  }
}

export function evChargingLabel(status: string): string {
  switch (status) {
    case 'na': return 'लागू नहीं'
    case 'pending': return 'बाकी'
    case 'charging': return 'चार्ज हो रही है'
    case 'complete': return 'पूरी'
    default: return '—'
  }
}

export function pdiStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'बाकी'
    case 'passed': return 'पास'
    case 'failed': return 'फेल'
    default: return '—'
  }
}