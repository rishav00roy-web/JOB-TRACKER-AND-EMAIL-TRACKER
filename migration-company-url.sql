-- Company's official domain, resolved via a Firecrawl search at push time
-- (deduped per company per batch). A resolvable domain doubles as a
-- legitimacy signal, reflected into company_tier alongside it.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS company_url TEXT;
