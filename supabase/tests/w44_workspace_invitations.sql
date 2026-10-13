-- W44 workspace invitation security and lifecycle contract.
begin;
create extension if not exists pgtap;

select plan(17);

select ok(to_regclass('public.workspace_invitations') is not null, 'workspace invitations table exists');
select ok((select relrowsecurity from pg_class where oid='public.workspace_invitations'::regclass), 'workspace invitations RLS enabled');
select ok(not has_table_privilege('anon','public.workspace_invitations','SELECT'), 'anon has no invitation table SELECT');
select ok(exists(select 1 from pg_constraint where conrelid='public.workspace_invitations'::regclass and conname='workspace_invitations_role_check'), 'invitation role constraint exists');
select ok(exists(select 1 from pg_constraint where conrelid='public.workspace_invitations'::regclass and conname='workspace_invitations_status_check'), 'invitation status constraint exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='create_workspace_invitation'), 'private create invitation function exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='get_workspace_invitation'), 'private get invitation function exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='accept_workspace_invitation'), 'private accept invitation function exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='revoke_workspace_invitation'), 'private revoke invitation function exists');
select ok(not has_function_privilege('anon','public.accept_workspace_invitation(text)','EXECUTE'), 'anon cannot accept invitations');
select ok(has_function_privilege('authenticated','public.accept_workspace_invitation(text)','EXECUTE'), 'authenticated can accept invitations');
select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname in ('create_workspace_invitation','get_workspace_invitation','accept_workspace_invitation','revoke_workspace_invitation')
    and p.prosecdef
    and coalesce(array_to_string(p.proconfig,'|'),'') not like '%search_path=pg_catalog, public%'
), 'all private invitation SECURITY DEFINER functions pin search_path');

select ok(
  lower(pg_get_functiondef('private.create_workspace_invitation(uuid,text,text,text,timestamptz)'::regprocedure)) like '%v_actor_role is null%'
  and lower(pg_get_functiondef('private.revoke_workspace_invitation(uuid)'::regprocedure)) like '%v_actor_role is null%'
  and lower(pg_get_functiondef('private.create_workspace_invitation(uuid,text,text,text,timestamptz)'::regprocedure)) like '%v_actor_role not in%'
  and lower(pg_get_functiondef('private.revoke_workspace_invitation(uuid)'::regprocedure)) like '%v_actor_role not in%',
  'invitation create and revoke reject a missing workspace role');

select ok(
  (select prosecdef from pg_proc where oid = 'public.revoke_workspace_invitation(uuid)'::regprocedure)
  and coalesce(array_to_string((select proconfig from pg_proc where oid = 'public.revoke_workspace_invitation(uuid)'::regprocedure), '|'), '')
    like '%search_path=pg_catalog, public, private%'
  and has_function_privilege('authenticated', 'public.revoke_workspace_invitation(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.revoke_workspace_invitation(uuid)', 'EXECUTE'),
  'the public revoke wrapper uses a pinned definer while direct private RPC execution remains denied');

create temporary table w44_cross_workspace_results (
  create_denied boolean not null,
  attacker_invitation_created boolean not null,
  revoke_denied boolean not null,
  target_status text not null,
  activity_before integer not null,
  activity_after integer not null
) on commit drop;

do $w44_cross_workspace$
declare
  v_owner uuid := gen_random_uuid();
  v_attacker uuid := gen_random_uuid();
  v_target_workspace uuid := gen_random_uuid();
  v_attacker_workspace uuid := gen_random_uuid();
  v_pending public.workspace_invitations;
  v_create_denied boolean := false;
  v_revoke_denied boolean := false;
  v_activity_before integer := 0;
  v_activity_after integer := 0;
begin
  insert into auth.users(id) values (v_owner), (v_attacker);
  insert into public.workspaces(id, owner_id, name)
  values
    (v_target_workspace, v_owner, 'W44 protected invitation workspace'),
    (v_attacker_workspace, v_attacker, 'W44 separate attacker workspace');
  insert into public.workspace_members(workspace_id, user_id, role)
  values
    (v_target_workspace, v_owner, 'owner'),
    (v_attacker_workspace, v_attacker, 'owner');

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select * into v_pending
    from public.create_workspace_invitation(
      v_target_workspace,
      'target-invite@example.invalid',
      'member',
      repeat('a', 64),
      clock_timestamp() + interval '1 hour'
    );
  perform set_config('role', 'postgres', true);
  select count(*) into v_activity_before from public.workspace_activity where workspace_id = v_target_workspace;

  perform set_config('request.jwt.claim.sub', v_attacker::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_attacker, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    perform public.create_workspace_invitation(
      v_target_workspace,
      'cross-workspace-attacker@example.invalid',
      'member',
      repeat('b', 64),
      clock_timestamp() + interval '1 hour'
    );
  exception when sqlstate '42501' then
    if sqlerrm = 'WORKSPACE_ADMIN_REQUIRED' then v_create_denied := true; else raise; end if;
  end;

  begin
    perform public.revoke_workspace_invitation(v_pending.id);
  exception when sqlstate '42501' then
    if sqlerrm = 'WORKSPACE_ADMIN_REQUIRED' then v_revoke_denied := true; else raise; end if;
  end;

  perform set_config('role', 'postgres', true);
  select count(*) into v_activity_after from public.workspace_activity where workspace_id = v_target_workspace;
  insert into w44_cross_workspace_results
  values (
    v_create_denied,
    exists (
      select 1 from public.workspace_invitations
       where workspace_id = v_target_workspace
         and invited_by = v_attacker
         and email = 'cross-workspace-attacker@example.invalid'
    ),
    v_revoke_denied,
    (select status from public.workspace_invitations where id = v_pending.id),
    v_activity_before,
    v_activity_after
  );
end;
$w44_cross_workspace$;

select ok(
  (select create_denied and not attacker_invitation_created from w44_cross_workspace_results),
  'a separate-workspace owner cannot create an invitation in the target workspace');
select ok(
  (select revoke_denied and target_status = 'PENDING' from w44_cross_workspace_results),
  'a separate-workspace owner cannot revoke the target workspace invitation');

select ok(
  (select activity_before = activity_after from w44_cross_workspace_results),
  'denied invitation create/revoke attempts add no workspace activity');

select * from finish();
rollback;
