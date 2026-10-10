-- W53: scalar-subquery auth.uid() optimization must preserve the
-- authorization checks in each policy reported by the Development Advisor.
begin;
create extension if not exists pgtap;
select plan(6);

select ok(exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='agent_executions'
    and policyname='agent_executions_editor_insert'
    and with_check like '%SELECT auth.uid()%'
    and with_check like '%private.can_edit_workspace%'
    and with_check like '%requested_by%'
), 'agent execution inserts still require workspace edit permission and the caller as requester');

select ok(exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='mission_approvals'
    and policyname='mission_approvals_member_insert'
    and with_check like '%SELECT auth.uid()%'
    and with_check like '%private.is_workspace_member%'
    and with_check like '%requested_by%'
), 'approval inserts still require workspace membership and the caller as requester');

select ok(exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='missions'
    and policyname='missions_insert_member'
    and with_check like '%SELECT auth.uid()%'
    and with_check like '%owner_id%'
    and with_check like '%private.can_edit_workspace%'
), 'mission inserts still require caller ownership and workspace edit permission');

select ok(exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_invitations'
    and policyname='workspace_invitations_owner_insert'
    and with_check like '%SELECT auth.uid()%'
    and with_check like '%private.workspace_role%'
    and with_check like '%invited_by%'
), 'invitation inserts still require owner/admin role and the caller as inviter');

select ok(exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='workspace_members'
    and policyname='workspace_members_owner_manage'
    and qual like '%SELECT auth.uid()%'
    and qual like '%w.owner_id%'
    and with_check like '%SELECT auth.uid()%'
    and with_check like '%w.owner_id%'
), 'workspace membership management still requires the workspace owner in both USING and WITH CHECK');

select ok(exists(
  select 1 from pg_policies
  where schemaname='public' and tablename='workspaces'
    and policyname='workspaces_delete_owner'
    and qual like '%SELECT auth.uid()%'
    and qual like '%owner_id%'
), 'workspace deletion remains restricted to its owner');

select * from finish();
rollback;
