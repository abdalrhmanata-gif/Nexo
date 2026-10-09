-- W47: create a new owner's workspace and membership atomically.
-- W39 restricts workspace reads to workspace members. The former client-side
-- INSERT ... RETURNING path could not see a just-created workspace before its
-- owner membership existed, causing first-mission creation to fail under RLS.

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

  -- Serialize bootstrap for this user so concurrent first requests cannot
  -- create multiple owner workspaces.
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

  return v_workspace_id;
end;
$function$;

revoke all on function private.ensure_owned_workspace() from public, anon, authenticated;
grant execute on function private.ensure_owned_workspace() to authenticated;

create or replace function public.ensure_owned_workspace()
returns uuid
language sql
security invoker
set search_path = pg_catalog, public, private
as $function$
  select private.ensure_owned_workspace();
$function$;

revoke all on function public.ensure_owned_workspace() from public, anon;
grant execute on function public.ensure_owned_workspace() to authenticated;
