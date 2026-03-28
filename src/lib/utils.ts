import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, isToday, isTomorrow, differenceInDays, parseISO, isWithinInterval, addHours } from 'date-fns'
import type { CarStatus, DeliveryDateStatus, MatchedStock, TransferTask } from '@/types'
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
  // time comes as HH:MM:SS from postgres
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

export function fmtDateTime(date: string | null, time: string | null): string {
  if (!date) return '—'
  return `${fmtDate(date)}${time ? ', ' + fmtTime(time) : ''}`
}

export function getDeliveryStatus(date: string | null | undefined): DeliveryDateStatus {
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
    case 'today':     return 'Today'
    case 'tomorrow':  return 'Tomorrow'
    case 'overdue':   return 'Overdue'
    case 'this_week': return 'This Week'
    case 'future':    return 'Upcoming'
    default:          return '—'
  }
}

export function isWithin48Hours(date: string | null | undefined): boolean {
  if (!date) return false
  try {
    const d = parseISO(date)
    const now = new Date()
    return isWithinInterval(d, { start: now, end: addHours(now, 48) })
  } catch {
    return false
  }
}

// ── Ageing helpers ────────────────────────────────────────────────────────────
export function ageingClass(days: number | null): string {
  if (days === null) return 'text-slate-400'
  if (days <= 15) return 'text-emerald-600 bg-emerald-50'
  if (days <= 30) return 'text-amber-600 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

// ── Customer name ─────────────────────────────────────────────────────────────
export function customerName(row: Pick<MatchedStock, 'first_name' | 'last_name'>): string {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || '—'
}

// ── Initials ──────────────────────────────────────────────────────────────────
export function initials(first: string, last?: string | null): string {
  const f = first.charAt(0).toUpperCase()
  const l = last ? last.charAt(0).toUpperCase() : ''
  return f + l
}

// ── WhatsApp URL builder ──────────────────────────────────────────────────────
export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleaned = phone.replace(/\D/g, '')
  const withCountry = cleaned.startsWith('91') ? cleaned : `91${cleaned}`
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`
}

// ── Truncate ──────────────────────────────────────────────────────────────────
export function truncate(str: string | null | undefined, n: number): string {
  if (!str) return '—'
  return str.length > n ? str.slice(0, n) + '…' : str
}

// ── Sales team map ────────────────────────────────────────────────────────────
/**
 * Fetches all employees and returns a Map<"First Last", locationName>
 */
export async function buildSalesTeamMap(): Promise<Map<string, string>> {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name, location:locations(name)')

  if (error || !data) return new Map()

  const map = new Map<string, string>()
  for (const emp of (data as unknown) as Array<{ first_name: string; last_name: string | null; location: { name: string } | null }>) {
    const fullName = [emp.first_name, emp.last_name].filter(Boolean).join(' ')
    if (fullName && emp.location?.name) {
      map.set(fullName, emp.location.name)
    }
  }
  return map
}

// ── Car status derivation ─────────────────────────────────────────────────────
export function deriveCarStatus(
  stock: Pick<MatchedStock, 'current_location'>,
  bookingBranch: string | null,
  transfer: TransferTask | null,
  qcStatus: string | null,
  _deliveryDate: string | null
): CarStatus {
  const atBranch =
    !bookingBranch ||
    stock.current_location === bookingBranch ||
    transfer?.status === 'arrived'

  if (!atBranch) {
    if (!transfer) return 'transfer_needed'
    if (transfer.status === 'assigned') return 'transfer_assigned'
    return 'in_transit'
  }

  // at branch
  if (!qcStatus) return 'qc_pending'
  if (qcStatus === 'rejected' || qcStatus === 'failed') return 'qc_rejected'
  if (qcStatus === 'approved' || qcStatus === 'completed') {
    if (_deliveryDate) return 'ready'
    return 'qc_approved'
  }
  return 'qc_pending'
}

// ── Car status display ────────────────────────────────────────────────────────
export function carStatusLabel(status: CarStatus): string {
  switch (status) {
    case 'transfer_needed':   return 'Transfer Needed'
    case 'transfer_assigned': return 'Transfer Assigned'
    case 'in_transit':        return 'In Transit'
    case 'at_branch':         return 'At Branch'
    case 'qc_pending':        return 'QC Pending'
    case 'qc_approved':       return 'QC Approved'
    case 'qc_rejected':       return 'QC Rejected'
    case 'ready':             return 'Ready'
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
