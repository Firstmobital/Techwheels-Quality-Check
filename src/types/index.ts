// Database row types

export type RoleCode = 'PDIQCMGR' | 'DRIVER' | 'TECHNICIAN' | 'YARDMGR' | 'SALES'

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
  id: string // UUID; currently crm_opty_id mapped flow is used.
  crm_opty_id: string | null
  delivery_date: string | null
  delivery_time: string | null
  qc_check_status: string | null
}

export interface QCRecord {
  id: string
  chassis_no: string
  booking_id: string | null // Stored as text crm_opty_id.
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

export type TransferTaskType = 'yard_transfer' | 'stock_transfer'

export interface TransferTask {
  id: string
  chassis_no: string
  task_type: TransferTaskType
  from_dealer: string | null
  driver_id: number
  from_location: string
  to_location: string
  status: 'assigned' | 'picked_up' | 'arrived'
  assigned_at: string
  picked_up_at: string | null
  arrived_at: string | null
  notes: string | null
}

export interface YardSlot {
  id: string
  yard_name: string
  chassis_no: string
  slot_no: string | null
  intake_type: 'trolley' | 'stock_transfer'
  from_dealer: string | null
  ev_charging_status: 'na' | 'pending' | 'charging' | 'complete'
  is_blocked: boolean
  ready_for_pdi: boolean
  arrived_at: string
  notes: string | null
  created_by: number | null
}

export type PDIStatus = 'pending' | 'passed' | 'failed'

export interface PDIRecord {
  id: string
  chassis_no: string
  technician_id: number | null
  checklist: QCChecklistItem[]
  photo_urls: QCPhoto[]
  remarks: string | null
  status: PDIStatus
  attempt_no: number
  checked_at: string | null
  technician?: Pick<Employee, 'first_name' | 'last_name'>
}

export type FaultSeverity = 'minor' | 'major' | 'critical'
export type FaultStatus = 'open' | 'in_progress' | 'resolved' | 'verified'
export type FaultStage = 'pdi' | 'delivery_qc'

export interface FaultTicket {
  id: string
  chassis_no: string
  stage: FaultStage
  raised_by: number | null
  assigned_to: number | null
  severity: FaultSeverity
  description: string
  photo_urls: QCPhoto[]
  status: FaultStatus
  resolution_notes: string | null
  resolved_at: string | null
  created_at: string
  assigned_employee?: Pick<Employee, 'first_name' | 'last_name'>
}

export type MovementEventType =
  | 'intake_trolley'
  | 'intake_stock_transfer'
  | 'pdi_passed'
  | 'pdi_failed'
  | 'transfer_assigned'
  | 'transfer_picked_up'
  | 'transfer_arrived'
  | 'qc_approved'
  | 'qc_rejected'
  | 'fault_raised'
  | 'fault_resolved'
  | 'delivery_ready'

export interface ChassisMovement {
  id: string
  chassis_no: string
  event_type: MovementEventType
  from_location: string | null
  to_location: string | null
  performed_by: number | null
  notes: string | null
  metadata: Record<string, unknown> | null
  event_at: string
  performer?: Pick<Employee, 'first_name' | 'last_name'>
}

export type ConcernCategory =
  | 'delivery_delay'
  | 'vehicle_condition'
  | 'documentation'
  | 'yard_capacity'
  | 'ev_charging'
  | 'vehicle_missing'
  | 'safety'
  | 'other'

export type ConcernStatus = 'open' | 'seen' | 'resolved' | 'rejected'
export type ConcernRoleType = 'sales' | 'yard_manager'

export interface Concern {
  id: string
  raised_by: number
  role_type: ConcernRoleType
  chassis_no: string | null
  category: ConcernCategory
  description: string
  status: ConcernStatus
  manager_comment: string | null
  resolved_by: number | null
  resolved_at: string | null
  created_at: string
  raiser?: Pick<Employee, 'first_name' | 'last_name'>
}

// Derived and app-level types

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
  booking_uuid: string | null // booking.id UUID used for QC record save
  booking_id: string | null // crm_opty_id text used for booking updates
  delivery_date: string | null
  delivery_time: string | null
  // derived
  delivery_status: DeliveryDateStatus
  qc_status: string | null
  qc_record: QCRecord | null
  transfer: TransferTask | null
  car_status: CarStatus
  delivery_branch: string | null // resolved from sales_team -> employees -> locations
}

export interface AuthUser {
  employee: Employee
  role: Role
  location: Location | null
  isSuperAdmin: boolean
}

export type StockWithDelivery = StockWithMeta