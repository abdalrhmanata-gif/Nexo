-- F7: bound human verification and outcome JSON at the database write boundary.
-- The limits apply to every writer, including authenticated RPCs and trusted server paths.
create or replace function private.mission_jsonb_within_bounds(
  p_value jsonb,
  p_max_bytes integer,
  p_max_depth integer,
  p_max_nodes integer
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public, private
as $$
declare
  v_node_count bigint;
  v_max_depth integer;
begin
  if p_value is null
     or p_max_bytes < 1
     or p_max_depth < 1
     or p_max_nodes < 1
     or octet_length(p_value::text) > p_max_bytes then
    return false;
  end if;

  with recursive nodes(value, depth) as (
    select p_value, 1
    union all
    select child.value, parent.depth + 1
      from nodes parent
      cross join lateral (
        select item.value
          from jsonb_each(
            case when jsonb_typeof(parent.value) = 'object'
              then parent.value else '{}'::jsonb end
          ) item
        union all
        select item.value
          from jsonb_array_elements(
            case when jsonb_typeof(parent.value) = 'array'
              then parent.value else '[]'::jsonb end
          ) item
      ) child
     where parent.depth < p_max_depth + 1
  )
  select count(*), coalesce(max(depth), 0)
    into v_node_count, v_max_depth
    from nodes;

  return v_node_count <= p_max_nodes
     and v_max_depth <= p_max_depth;
end;
$$;

revoke all on function private.mission_jsonb_within_bounds(jsonb, integer, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function private.enforce_mission_verification_outcome_payload_bounds()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_table_name = 'mission_verifications' then
    if not private.mission_jsonb_within_bounds(new.criteria, 65536, 12, 1024)
       or not private.mission_jsonb_within_bounds(new.evidence, 65536, 12, 1024) then
      raise exception 'MISSION_VERIFICATION_PAYLOAD_TOO_LARGE'
        using errcode = '22023';
    end if;
  elsif tg_table_name = 'mission_outcomes' then
    if not private.mission_jsonb_within_bounds(new.result, 65536, 12, 1024) then
      raise exception 'MISSION_OUTCOME_PAYLOAD_TOO_LARGE'
        using errcode = '22023';
    end if;
  else
    raise exception 'UNSUPPORTED_MISSION_PAYLOAD_TABLE'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_mission_verification_outcome_payload_bounds()
  from public, anon, authenticated, service_role;

drop trigger if exists mission_verifications_payload_bounds
  on public.mission_verifications;
create trigger mission_verifications_payload_bounds
before insert or update of criteria, evidence
on public.mission_verifications
for each row execute function private.enforce_mission_verification_outcome_payload_bounds();

drop trigger if exists mission_outcomes_payload_bounds
  on public.mission_outcomes;
create trigger mission_outcomes_payload_bounds
before insert or update of result
on public.mission_outcomes
for each row execute function private.enforce_mission_verification_outcome_payload_bounds();
