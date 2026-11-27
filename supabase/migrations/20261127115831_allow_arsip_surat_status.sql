-- Keep the application archive status compatible with the surat status constraint.
ALTER TABLE public.surat
  DROP CONSTRAINT IF EXISTS surat_status_check;

ALTER TABLE public.surat
  ADD CONSTRAINT surat_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'siap_pdf'::text, 'selesai'::text, 'arsip'::text]));
