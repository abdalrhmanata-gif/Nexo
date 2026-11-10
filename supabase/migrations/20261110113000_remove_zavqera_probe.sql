-- Remove the temporary production probe table created during environment verification.
-- It has no application purpose and only creates a misleading RLS advisor finding.
drop table if exists public._zavqera_probe;