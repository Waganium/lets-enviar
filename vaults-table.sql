-- Run this in Supabase SQL Editor before deploying the new script.js/index.html

CREATE TABLE vaults (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_code text UNIQUE NOT NULL,
    vault_name text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Matches your current posture on the posts table: open for now, consciously.
-- Same caveat as before applies — anyone with the anon key can read/write this
-- table freely until you lock RLS down.
ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow public read" ON vaults FOR SELECT TO anon USING (true);
CREATE POLICY "allow public insert" ON vaults FOR INSERT TO public WITH CHECK (true);
