insert into public.workspace_agents(workspace_id,name,description,status,authority,created_by)
select w.id,'ZAVQERA Research Agent','Bounded read-only research agent. It can gather public information but cannot purchase, book, contact people, submit forms, or change accounts.','ACTIVE',
jsonb_build_object('mode','read_only','external_side_effects',false,'requires_approval',false),w.owner_id
from public.workspaces w
where not exists(select 1 from public.workspace_agents a where a.workspace_id=w.id and a.name='ZAVQERA Research Agent');