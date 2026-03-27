// ── Database row types ────────────────────────────────────────────────────────

export type RoleCode = 'PDIQCMGR' | 'DRIVER' | 'TECHNICIAN'

export interface Role {
  id: number
  name: string
  code: RoleCode
  department_id: number | null
  is_active: boolean
}

export interface Location {
  id: number
  name: string
  address: string | null
  city: string | null
}

export interface Employee {
  id: number
  auth_user_id: string
  first_name: string
  last_name: string | null
  email: string
  mobile: string | null
  role_id: number | null
  location_id: number | null
  photo_url: string | null
  employee_code: string | null
  // joined
  role?: Role
  location?: Location
}

export interface MatchedStock {
  raw_stock_id: string | null
  chassis_no: string
  original_chassis_no: string | null
  overridden_chassis_no: string | null
  parent_product_line: string | null
  product_line: string | null
  product_description: string | null
  product_vc: string | null
  manufacturing_date: string | null
  tm_invoice_date: string | null
  stock_updated_at: string | null
  stock_rank: number | null
  opportunity_name: string | null
  first_name: string | null
  last_name: string | null
  mobile_number: string | null
  sales_team: string | null
  stage_3_date: string | null
  current_location: string | null
  cust_rank: number | null
  ageing_base_date: string | null
  ageing_days: number | null
  // joined from booking
  delivery_date?: string | null
  delivery_time?: string | null
  booking_id?: string | null
  // joined from car_qc_records
  qc_status?: string | null
  qc_checked_at?: string | null
}

export interface Booking {
  id: string
  crm_opty_id: string | null
  child_vc: string | null
  delivery_date: string | null
  delivery_time: string | null
  expected_delivery_date: string | null
  qc_check_status: string | null
  qc_check_completed_at: string | null
  qc_check_completed_by: string | null
  customer_name: string
  customer_phone: string
}

export interface QCRecord {
  id: string
  chassis_no: string
  booking_id: string | null
  inspector_id: number | null
  checklist: QCChecklistItem[]
  photo_urls: QCPhoto[]
  remarks: string | null
  final_status: 'approved' | 'rejected' | null
  checked_at: string | null
  // joined
  inspector?: Pick<Employee, 'first_name' | 'last_name'>
}

export interface QCChecklistItem {
  key: string
  label: string
  passed: boolean
  note: string
}

export interface QCPhoto {
  label: string
  url: string
  path: string
}

// ── App-level types ───────────────────────────────────────────────────────────

export interface AuthUser {
  employee: Employee
  role: Role
  location: Location | null
  isSuperAdmin: boolean
}

export type DeliveryDateStatus = 'today' | 'tomorrow' | 'this_week' | 'future' | 'overdue' | null

export interface StockWithDelivery extends MatchedStock {
  delivery_date: string | null
  delivery_time: string | null
  delivery_status: DeliveryDateStatus
  qc_status: string | null
}
