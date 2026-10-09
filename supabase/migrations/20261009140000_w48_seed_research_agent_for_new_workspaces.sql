-- W48: ensure newly bootstrapped workspaces receive the default bounded Research Agent.
-- W41 seeds workspaces that exist at migration time; workspaces created later
-- need the same read-only agent so Research is available immediately.

create or replace function private.ensure_owned_workspace()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select w.id
    into v_workspace_id
    from public.workspaces as w
   where w.owner_id = v_user_id
   order by w.created_at asc, w.id asc
   limit 1
   for update;

  if v_workspace_id is null then
    insert into public.workspaces (owner_id, name)
    values (v_user_id, 'My workspace')
    returning id into v_workspace_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner')
  on conflict (workspace_id, user_id)
  do update set role = 'owner', updated_at = now();

  insert into public.workspace_agents
    (workspace_id, name, description, status, authority, created_by)
  select
    v_workspace_id,
    'ZAVQERA Research Agent',
    'Bounded read-only research agent. It can gather public information but cannot purchase, book, contact people, submit forms, or change accounts.',
    'ACTIVE',
    jsonb_build_object(
      'mode', 'read_only',
      'external_side_effects', false,
      'requires_approval', false
    ),
    v_user_id
  where not exists (
    select 1
      from public.workspace_agents as a
     where a.workspace_id = v_workspace_id
       and a.name = 'ZAVQERA Research Agent'
  );

  return v_workspace_id;
end;
$function$;
