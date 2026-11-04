-- Keep the public activity API as an invoker wrapper; only the private boundary is SECURITY DEFINER.
create or replace function private.list_workspace_activity(p_workspace_id uuid,p_limit integer default 50)
returns table(id uuid,event_type text,entity_type text,entity_id uuid,payload jsonb,actor_user_id uuid,created_at timestamptz)
language plpgsql security definer set search_path='pg_catalog','public' as $function$
begin
 if auth.uid() is null or private.workspace_role(p_workspace_id,auth.uid()) is null then raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501'; end if;
 return query select x.id,x.event_type,x.entity_type,x.entity_id,x.payload,x.actor_user_id,x.created_at
 from (
  select wa.id,wa.event_type,wa.entity_type,wa.entity_id,wa.payload,wa.actor_user_id,wa.created_at from public.workspace_activity wa where wa.workspace_id=p_workspace_id
  union all
  select me.id,me.event_type,'mission',me.mission_id,me.payload,null::uuid,me.created_at from public.mission_events me join public.missions m on m.id=me.mission_id where m.workspace_id=p_workspace_id
 ) x order by x.created_at desc limit greatest(1,least(coalesce(p_limit,50),200));
end; $function$;

create or replace function public.list_workspace_activity(p_workspace_id uuid,p_limit integer default 50)
returns table(id uuid,event_type text,entity_type text,entity_id uuid,payload jsonb,actor_user_id uuid,created_at timestamptz)
language sql set search_path='pg_catalog','public' as $function$
 select * from private.list_workspace_activity(p_workspace_id,p_limit);
$function$;
revoke all on function private.list_workspace_activity(uuid,integer) from public,anon,authenticated;
revoke all on function public.list_workspace_activity(uuid,integer) from public,anon;
grant execute on function public.list_workspace_activity(uuid,integer) to authenticated;