-- Create ENUM for Job Sources
CREATE TYPE job_source AS ENUM ('scraped', 'manual');

-- Create ENUM for Job Stages
CREATE TYPE job_stage AS ENUM ('wishlist', 'applied', 'interview', 'offer', 'rejected');

-- Create Jobs Table
CREATE TABLE public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source job_source NOT NULL,
    stage job_stage NOT NULL DEFAULT 'wishlist',
    job_title TEXT NOT NULL,
    company TEXT NOT NULL,
    company_tier TEXT,
    location TEXT,
    work_type TEXT,
    posted_date TIMESTAMP WITH TIME ZONE,
    match_score INTEGER,
    experience_match_summary TEXT,
    key_skills_match TEXT[],
    why_fits TEXT,
    application_link TEXT UNIQUE NOT NULL,
    easy_apply BOOLEAN,
    priority_level TEXT,
    compensation_insight TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Skills Table
CREATE TABLE public.skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    category TEXT NOT NULL CHECK (category IN ('agentic', 'general')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert Default Skills
INSERT INTO public.skills (name, weight, category) VALUES
    ('Claude', 3, 'agentic'),
    ('Cursor', 3, 'agentic'),
    ('AI-assisted', 3, 'agentic'),
    ('Agentic', 3, 'agentic'),
    ('Copilot', 2, 'agentic'),
    ('LLM', 3, 'agentic'),
    ('Next.js', 2, 'general'),
    ('React', 2, 'general'),
    ('TypeScript', 2, 'general'),
    ('Tailwind', 1, 'general'),
    ('Supabase', 2, 'general');

-- Enable RLS (we will bypass RLS in the API using Service Role key for now since this is a personal tracker)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

-- If you want the frontend to read jobs with the anon key without a login:
CREATE POLICY "Allow public read access to jobs" ON public.jobs FOR SELECT USING (true);
CREATE POLICY "Allow public read access to skills" ON public.skills FOR SELECT USING (true);
