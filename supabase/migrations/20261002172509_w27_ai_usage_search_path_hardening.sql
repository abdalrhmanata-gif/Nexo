-- W27 security hardening: put trusted built-ins ahead of user-writable schemas.
-- Keep this as a follow-up migration so already-applied W22 migrations remain immutable.
-- This changes function configuration only; no tables or data are changed.

alter function public.get_ai_usage()
  set search_path = pg_catalog, public;

alter function public.reserve_ai_generation(text)
  set search_path = pg_catalog, public;

alter function public.consume_ai_generation(uuid)
  set search_path = pg_catalog, public;

alter function public.release_ai_generation(uuid)
  set search_path = pg_catalog, public;
