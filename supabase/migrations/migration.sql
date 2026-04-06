-- Add new role codes to your existing roles table
-- Run this in Supabase SQL Editor

INSERT INTO public.roles (name, code, is_active)
VALUES 
  ('Yard Manager', 'YARDMGR', true),
  ('Sales Person', 'SALES', true)
ON CONFLICT (code) DO NOTHING;

-- Add is_super_admin column if it doesn't exist
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;


CREATE TABLE IF NOT EXISTS public.yard_slots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yard_name           text NOT NULL,
  chassis_no          text NOT NULL,
  slot_no             text,
  intake_type         text NOT NULL DEFAULT 'trolley' 
                        CHECK (intake_type IN ('trolley', 'stock_transfer')),
  from_dealer         text,
  ev_charging_status  text NOT NULL DEFAULT 'na'
                        CHECK (ev_charging_status IN ('na', 'pending', 'charging', 'complete')),
  is_blocked          boolean NOT NULL DEFAULT false,
  ready_for_pdi       boolean NOT NULL DEFAULT false,
  arrived_at          timestamptz NOT NULL DEFAULT now(),
  notes               text,
  created_by          bigint REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yard_slots_chassis ON public.yard_slots(chassis_no);
CREATE INDEX IF NOT EXISTS idx_yard_slots_yard    ON public.yard_slots(yard_name);

ALTER TABLE public.yard_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "yard_slots_all" ON public.yard_slots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

  CREATE TABLE IF NOT EXISTS public.pdi_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chassis_no      text NOT NULL,
  technician_id   bigint REFERENCES public.employees(id) ON DELETE SET NULL,
  checklist       jsonb,
  photo_urls      jsonb,
  remarks         text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'passed', 'failed')),
  attempt_no      integer NOT NULL DEFAULT 1,
  checked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdi_chassis_attempt_unique UNIQUE (chassis_no, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_pdi_chassis     ON public.pdi_records(chassis_no);
CREATE INDEX IF NOT EXISTS idx_pdi_technician  ON public.pdi_records(technician_id);
CREATE INDEX IF NOT EXISTS idx_pdi_status      ON public.pdi_records(status);

ALTER TABLE public.pdi_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdi_records_all" ON public.pdi_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


  CREATE TABLE IF NOT EXISTS public.fault_tickets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chassis_no         text NOT NULL,
  stage              text NOT NULL CHECK (stage IN ('pdi', 'delivery_qc')),
  raised_by          bigint REFERENCES public.employees(id) ON DELETE SET NULL,
  assigned_to        bigint REFERENCES public.employees(id) ON DELETE SET NULL,
  severity           text NOT NULL DEFAULT 'minor'
                       CHECK (severity IN ('minor', 'major', 'critical')),
  description        text NOT NULL,
  photo_urls         jsonb,
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'in_progress', 'resolved', 'verified')),
  resolution_notes   text,
  resolved_at        timestamptz,
  verified_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fault_chassis    ON public.fault_tickets(chassis_no);
CREATE INDEX IF NOT EXISTS idx_fault_assigned   ON public.fault_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_fault_status     ON public.fault_tickets(status);

ALTER TABLE public.fault_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fault_tickets_all" ON public.fault_tickets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);



  CREATE TABLE IF NOT EXISTS public.chassis_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chassis_no      text NOT NULL,
  event_type      text NOT NULL 
                    CHECK (event_type IN (
                      'intake_trolley',
                      'intake_stock_transfer',
                      'pdi_passed',
                      'pdi_failed',
                      'transfer_assigned',
                      'transfer_picked_up',
                      'transfer_arrived',
                      'qc_approved',
                      'qc_rejected',
                      'fault_raised',
                      'fault_resolved',
                      'delivery_ready'
                    )),
  from_location   text,
  to_location     text,
  performed_by    bigint REFERENCES public.employees(id) ON DELETE SET NULL,
  notes           text,
  metadata        jsonb,
  event_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_chassis   ON public.chassis_movements(chassis_no);
CREATE INDEX IF NOT EXISTS idx_movements_event_at  ON public.chassis_movements(event_at DESC);

ALTER TABLE public.chassis_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chassis_movements_all" ON public.chassis_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS public.concerns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raised_by        bigint NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role_type        text NOT NULL CHECK (role_type IN ('sales', 'yard_manager')),
  chassis_no       text,
  category         text NOT NULL 
                     CHECK (category IN (
                       'delivery_delay',
                       'vehicle_condition',
                       'documentation',
                       'yard_capacity',
                       'ev_charging',
                       'vehicle_missing',
                       'safety',
                       'other'
                     )),
  description      text NOT NULL,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'seen', 'resolved', 'rejected')),
  manager_comment  text,
  resolved_by      bigint REFERENCES public.employees(id) ON DELETE SET NULL,
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concerns_raised_by  ON public.concerns(raised_by);
CREATE INDEX IF NOT EXISTS idx_concerns_status     ON public.concerns(status);
CREATE INDEX IF NOT EXISTS idx_concerns_chassis    ON public.concerns(chassis_no);

ALTER TABLE public.concerns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concerns_all" ON public.concerns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add task_type column to transfer_tasks to distinguish stock transfers
ALTER TABLE public.transfer_tasks 
ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'yard_transfer'
  CHECK (task_type IN ('yard_transfer', 'stock_transfer'));

ALTER TABLE public.transfer_tasks
ADD COLUMN IF NOT EXISTS from_dealer text;