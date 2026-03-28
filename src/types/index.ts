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
}

export interface BookingRow {
  id: string           // UUID — needed to store in car_qc_records.booking_id... wait no, we use crm_opty_id now
  crm_opty_id: string | null
  delivery_date: string | null
  delivery_time: string | null
  qc_check_status: string | null
}

export interface QCRecord {
  id: string
  chassis_no: string
  booking_id: string | null   // now text = crm_opty_id
  inspector_id: number | null
  checklist: QCChecklistItem[]
  photo_urls: QCPhoto[]
  remarks: string | null
  final_status: 'approved' | 'rejected' | null
  checked_at: string | null
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

export interface TransferTask {
  id: string
  chassis_no: string
  driver_id: number
  from_location: string
  to_location: string
  status: 'assigned' | 'picked_up' | 'arrived'
  assigned_at: string
  picked_up_at: string | null
  arrived_at: string | null
  notes: string | null
}

// ── Derived / app-level types ─────────────────────────────────────────────────

export type DeliveryDateStatus =
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'future'
  | 'overdue'
  | null

export type CarStatus =
  | 'transfer_needed'
  | 'transfer_assigned'
  | 'in_transit'
  | 'at_branch'
  | 'qc_pending'
  | 'qc_approved'
  | 'qc_rejected'
  | 'ready'

export interface StockWithMeta extends MatchedStock {
  // from booking join
  booking_uuid: string | null      // booking.id UUID — used for QC record save
  booking_id: string | null        // crm_opty_id text — used for booking updates
  delivery_date: string | null
  delivery_time: string | null
  // derived
  delivery_status: DeliveryDateStatus
  qc_status: string | null
  qc_record: QCRecord | null
  transfer: TransferTask | null
  car_status: CarStatus
  delivery_branch: string | null   // resolved from sales_team → employees → locations
}

export interface AuthUser {
  employee: Employee
  role: Role
  location: Location | null
  isSuperAdmin: boolean
}

export type StockWithDelivery = StockWithMeta