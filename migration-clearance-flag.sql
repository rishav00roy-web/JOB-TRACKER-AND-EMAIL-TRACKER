-- Adds the clearance/citizenship-requirement flag used by scoring.ts to
-- deprioritize US-government-clearance roles (e.g. remote FOIA postings that
-- still require US citizenship verification).
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS clearance_required BOOLEAN DEFAULT FALSE;
