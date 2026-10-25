-- Runtime authorization regressions for the W45/W46 member mutation helpers.
begin;
create extension if not exists pgtap;
select plan(10);

create temporary table pr29_member_authz_results(name text primary key, passed boolean not null) on commit drop;

do $test$
declare
  v_owner uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_viewer uuid := gen_random_uuid();
  v_other_member uuid := gen_random_uuid();
  v_workspace uuid := gen_random_uuid();
  v_denied boolean;
begin
  insert into auth.users(id) values (v_owner),(v_admin),(v_member),(v_viewer),(v_other_member);
  insert into public.workspaces(id,owner_id,name) values(v_workspace,v_owner,'PR29 member authorization test');
  insert into public.workspace_members(workspace_id,user_id,role) values
    (v_workspace,v_owner,'owner'),(v_workspace,v_admin,'admin'),(v_workspace,v_member,'member'),
    (v_workspace,v_viewer,'viewer'),(v_workspace,v_other_member,'member');

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated')::text,true);

  perform set_config('request.jwt.claim.sub',v_member::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_member,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  v_denied:=false;
  begin perform public.update_workspace_member_role((select id from public.workspace_members where workspace_id=v_workspace and user_id=v_other_member),'admin');
  exception when sqlstate '42501' then v_denied:=sqlerrm='WORKSPACE_ADMIN_REQUIRED'; end;
  perform set_config('role','postgres',true);
  insert into pr29_member_authz_results values('member cannot promote another member',v_denied and (select role='member' from public.workspace_members where workspace_id=v_workspace and user_id=v_other_member));

  perform set_config('request.jwt.claim.sub',v_viewer::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_viewer,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  v_denied:=false;
  begin perform private.update_workspace_member_role((select id from public.workspace_members where workspace_id=v_workspace and user_id=v_viewer),'admin');
  exception when sqlstate '42501' then v_denied:=sqlerrm='WORKSPACE_ADMIN_REQUIRED'; end;
  perform set_config('role','postgres',true);
  insert into pr29_member_authz_results values('viewer cannot promote self through private helper',v_denied and (select role='viewer' from public.workspace_members where workspace_id=v_workspace and user_id=v_viewer));

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  perform public.update_workspace_member_role((select id from public.workspace_members where workspace_id=v_workspace and user_id=v_other_member),'admin');
  perform set_config('role','postgres',true);
  insert into pr29_member_authz_results values('admin can promote an ordinary member', (select role='admin' from public.workspace_members where workspace_id=v_workspace and user_id=v_other_member));

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  v_denied:=false;
  begin perform private.update_workspace_member_role((select id from public.workspace_members where workspace_id=v_workspace and user_id=v_viewer),'owner');
  exception when sqlstate '42501' then v_denied:=sqlerrm='OWNER_ESCALATION_FORBIDDEN'; end;
  perform set_config('role','postgres',true);
  insert into pr29_member_authz_results values('admin still cannot assign owner role',v_denied and (select role='viewer' from public.workspace_members where workspace_id=v_workspace and user_id=v_viewer));

  update public.workspace_members set role='member' where workspace_id=v_workspace and user_id=v_other_member;
  perform set_config('request.jwt.claim.sub',v_viewer::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_viewer,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  v_denied:=false;
  begin perform public.remove_workspace_member((select id from public.workspace_members where workspace_id=v_workspace and user_id=v_other_member));
  exception when sqlstate '42501' then v_denied:=sqlerrm='WORKSPACE_ADMIN_REQUIRED'; end;
  perform set_config('role','postgres',true);
  insert into pr29_member_authz_results values('viewer cannot remove another ordinary member',v_denied and exists(select 1 from public.workspace_members where workspace_id=v_workspace and user_id=v_other_member));

  perform set_config('request.jwt.claim.sub',v_member::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_member,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  v_denied:=false;
  begin perform private.remove_workspace_member((select id from public.workspace_members where workspace_id=v_workspace and user_id=v_viewer));
  exception when sqlstate '42501' then v_denied:=sqlerrm='WORKSPACE_ADMIN_REQUIRED'; end;
  perform set_config('role','postgres',true);
  insert into pr29_member_authz_results values('member cannot bypass through private removal helper',v_denied and exists(select 1 from public.workspace_members where workspace_id=v_workspace and user_id=v_viewer));

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  perform public.remove_workspace_member((select id from public.workspace_members where workspace_id=v_workspace and user_id=v_other_member));
  perform set_config('role','postgres',true);
  insert into pr29_member_authz_results values('admin can remove ordinary member',not exists(select 1 from public.workspace_members where workspace_id=v_workspace and user_id=v_other_member));

  perform set_config('request.jwt.claim.sub',v_member::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_member,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  perform public.remove_workspace_member((select id from public.workspace_members where workspace_id=v_workspace and user_id=v_member));
  perform set_config('role','postgres',true);
  insert into pr29_member_authz_results values('member can still remove self',not exists(select 1 from public.workspace_members where workspace_id=v_workspace and user_id=v_member));

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  perform public.update_workspace_member_role((select id from public.workspace_members where workspace_id=v_workspace and user_id=v_viewer),'admin');
  perform set_config('role','postgres',true);
  insert into pr29_member_authz_results values('owner can still assign admin role',(select role='admin' from public.workspace_members where workspace_id=v_workspace and user_id=v_viewer));

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  v_denied:=false;
  begin perform public.remove_workspace_member((select id from public.workspace_members where workspace_id=v_workspace and user_id=v_owner));
  exception when sqlstate '42501' then v_denied:=sqlerrm='OWNER_PROTECTED'; end;
  perform set_config('role','postgres',true);
  insert into pr29_member_authz_results values('admin cannot remove workspace owner',v_denied and exists(select 1 from public.workspace_members where workspace_id=v_workspace and user_id=v_owner));
end;
$test$;

select ok(passed,name) from pr29_member_authz_results order by name;
select * from finish();
rollback;
