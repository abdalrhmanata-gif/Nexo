-- W44 invitation token identity constraints.
begin;
create extension if not exists pgtap;
select plan(3);

select ok(
  to_regclass('public.workspace_invitations_token_hash_uidx') is not null,
  'invitation token hashes have a unique index'
);
select ok(
  exists (
    select 1 from pg_constraint
     where conrelid='public.workspace_invitations'::regclass
       and conname='workspace_invitations_token_hash_check'
  ),
  'invitation token hashes must be lowercase SHA-256 hex'
);

create temporary table w44_token_hash_fixture (
  user_id uuid not null,
  workspace_id uuid not null
) on commit drop;

do $fixture$
declare
  v_user uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
begin
  insert into auth.users(id) values (v_user);
  insert into public.workspaces(id, owner_id, name)
  values (v_workspace, v_user, 'W44 token hash integrity');
  insert into w44_token_hash_fixture values (v_user, v_workspace);
  insert into public.workspace_invitations(
    workspace_id,email,role,invited_by,token_hash,expires_at
  ) values (
    v_workspace,'first@example.invalid','member',v_user,repeat('a',64),now()+interval '1 hour'
  );
end;
$fixture$;

select throws_ok(
  format(
    'insert into public.workspace_invitations(workspace_id,email,role,invited_by,token_hash,expires_at) values (%L,%L,%L,%L,%L,now()+interval ''1 hour'')',
    (select workspace_id from w44_token_hash_fixture),
    'second@example.invalid','member',
    (select user_id from w44_token_hash_fixture),
    repeat('a',64)
  ),
  '23505',
  null,
  'the same token hash cannot identify two invitations'
);

select * from finish();
rollback;
