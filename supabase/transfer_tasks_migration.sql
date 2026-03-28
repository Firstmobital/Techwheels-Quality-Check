CREATE TABLE IF NOT EXISTS public.transfer_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chassis_no text NOT NULL,
  driver_id bigint REFERENCES public.employees(id) ON DELETE SET NULL,
  from_location text NOT NULL,
  to_location text NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','picked_up','arrived')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  picked_up_at timestamptz,
  arrived_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_chassis ON public.transfer_tasks(chassis_no);
CREATE INDEX IF NOT EXISTS idx_transfer_driver ON public.transfer_tasks(driver_id);

ALTER TABLE public.transfer_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfer_tasks_all" ON public.transfer_tasks
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
