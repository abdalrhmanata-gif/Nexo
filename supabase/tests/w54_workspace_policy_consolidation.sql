-- W54 guards the exact SELECT policy boundary and least-privilege
-- write-policy split for workspace_agents and workspace_members.
begin;
create extension if not exists pgtap;
select plan(12);

select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_agents'
    and policyname='workspace_agents_admin_manage'
), 'the broad FOR ALL policy is removed from workspace_agents');

select is((
  select count(*)::integer from pg_policies
  where schemaname='public' and tablename='workspace_agents'
    and cmd='SELECT' and permissive='PERMISSIVE'
), 1, 'workspace_agents has one permissive SELECT policy');

select ok(exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_agents'
    and policyname='workspace_agents_member_select'
    and cmd='SELECT' and roles::text='{authenticated}'
    and qual like '%private.is_workspace_member%'
), 'workspace_agents SELECT remains limited to authenticated workspace members');

select ok(exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_agents'
    and policyname='workspace_agents_admin_insert'
    and cmd='INSERT' and roles::text='{authenticated}'
    and with_check like '%private.workspace_role%'
    and with_check like '%owner%'
    and with_check like '%admin%'
), 'workspace_agents INSERT remains owner/admin-only');

select ok(exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_agents'
    and policyname='workspace_agents_admin_update'
    and cmd='UPDATE' and roles::text='{authenticated}'
    and qual like '%private.workspace_role%'
    and with_check like '%private.workspace_role%'
    and with_check like '%owner%'
    and with_check like '%admin%'
), 'workspace_agents UPDATE retains owner/admin USING and WITH CHECK guards');

select ok(exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_agents'
    and policyname='workspace_agents_admin_delete'
    and cmd='DELETE' and roles::text='{authenticated}'
    and qual like '%private.workspace_role%'
    and qual like '%owner%'
    and qual like '%admin%'
), 'workspace_agents DELETE remains owner/admin-only');

select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_members'
    and policyname='workspace_members_owner_manage'
), 'the broad FOR ALL policy is removed from workspace_members');

select is((
  select count(*)::integer from pg_policies
  where schemaname='public' and tablename='workspace_members'
    and cmd='SELECT' and permissive='PERMISSIVE'
), 1, 'workspace_members has one permissive SELECT policy');

select ok(exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_members'
    and policyname='workspace_members_select_member'
    and cmd='SELECT' and roles::text='{authenticated}'
    and qual like '%private.is_workspace_member%'
    and qual like '%w.owner_id%'
    and qual like '%SELECT auth.uid()%'
), 'workspace_members SELECT preserves member visibility and the prior owner visibility');

select ok(exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_members'
    and policyname='workspace_members_owner_insert'
    and cmd='INSERT' and roles::text='{authenticated}'
    and with_check like '%w.owner_id%'
    and with_check like '%SELECT auth.uid()%'
), 'workspace_members INSERT remains owner-only');

select ok(exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_members'
    and policyname='workspace_members_owner_update'
    and cmd='UPDATE' and roles::text='{authenticated}'
    and qual like '%w.owner_id%'
    and qual like '%SELECT auth.uid()%'
    and with_check like '%w.owner_id%'
    and with_check like '%SELECT auth.uid()%'
), 'workspace_members UPDATE remains owner-only in USING and WITH CHECK');

select ok(exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_members'
    and policyname='workspace_members_owner_delete'
    and cmd='DELETE' and roles::text='{authenticated}'
    and qual like '%w.owner_id%'
    and qual like '%SELECT auth.uid()%'
), 'workspace_members DELETE remains owner-only');

select * from finish();
rollback;
