-- Flags postings whose text says on-site/office-based despite being listed
-- as remote (RemoteOK especially lets companies mistag office roles).
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS on_site_required BOOLEAN DEFAULT FALSE;
