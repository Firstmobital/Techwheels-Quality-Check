-- ── Run this in your Supabase SQL Editor ────────────────────────────────────

-- 1. QC Records table
CREATE TABLE IF NOT EXISTS public.car_qc_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chassis_no    text NOT NULL,
  booking_id    uuid REFERENCES public.booking(id) ON DELETE SET NULL,
  inspector_id  bigint REFERENCES public.employees(id) ON DELETE SET NULL,
  checklist     jsonb,
  photo_urls    jsonb,
  remarks       text,
  final_status  text CHECK (final_status IN ('approved', 'rejected')),
  checked_at    timestamptz DEFAULT now(),
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT car_qc_records_chassis_unique UNIQUE (chassis_no)
);

CREATE INDEX IF NOT EXISTS idx_car_qc_chassis ON public.car_qc_records (chassis_no);

ALTER TABLE public.car_qc_records ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write QC records
CREATE POLICY "qc_records_all" ON public.car_qc_records
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- 2. App settings table (for yard numbers, etc.)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_read" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "app_settings_write" ON public.app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed default yards
INSERT INTO public.app_settings (key, value)
VALUES ('yards', '["Yard 1", "Yard 2", "Yard 3"]'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- 3. Storage bucket for QC photos
-- Run this in the Supabase Dashboard → Storage → New Bucket
-- Name: qc-photos
-- Public: true (so photo URLs work without auth tokens)
-- Or run via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('qc-photos', 'qc-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "qc_photos_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'qc-photos');

CREATE POLICY "qc_photos_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'qc-photos');

CREATE POLICY "qc_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'qc-photos');
