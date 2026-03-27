import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, isToday, isTomorrow, differenceInDays, parseISO } from 'date-fns'
import type { DeliveryDateStatus, StockWithDelivery } from '@/types'

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

// ── Ageing helpers ────────────────────────────────────────────────────────────
export function ageingClass(days: number | null): string {
  if (days === null) return 'text-slate-400'
  if (days <= 15) return 'text-emerald-600 bg-emerald-50'
  if (days <= 30) return 'text-amber-600 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

// ── Customer name ─────────────────────────────────────────────────────────────
export function customerName(row: Pick<StockWithDelivery, 'first_name' | 'last_name'>): string {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || '—'
}

// ── WhatsApp URL builder ──────────────────────────────────────────────────────
export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleaned = phone.replace(/\D/g, '')
  const withCountry = cleaned.startsWith('91') ? cleaned : `91${cleaned}`
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`
}

export function buildDriverWhatsAppMessage(params: {
  driverName: string
  chassisNo: string
  model: string
  variant: string
  colour: string
  yardNo: string
  customerName: string
  deliveryDate: string | null
  deliveryTime: string | null
  deliveryLocation: string
}): string {
  const { driverName, chassisNo, model, variant, colour, yardNo,
          customerName, deliveryDate, deliveryTime, deliveryLocation } = params

  return `Namaste ${driverName} ji 🙏

Aapko ek gaadi lene ke liye bheja ja raha hai:

🚗 *Gaadi:* ${model} ${variant}
🔑 *Chassis No:* ${chassisNo}
🎨 *Colour:* ${colour || '—'}
📍 *Yard No:* ${yardNo}
👤 *Customer:* ${customerName}${deliveryDate ? `
📅 *Delivery Date:* ${fmtDate(deliveryDate)}${deliveryTime ? ' at ' + fmtTime(deliveryTime) : ''}
🏠 *Deliver To:* ${deliveryLocation}` : ''}

Kripya jald se jald gaadi pick karke showroom par pahunchayein.

Shukriya! 🙏`
}

// ── Truncate ──────────────────────────────────────────────────────────────────
export function truncate(str: string | null | undefined, n: number): string {
  if (!str) return '—'
  return str.length > n ? str.slice(0, n) + '…' : str
}
