-- W61: provide reviewers with a safe payload-shape preview without persisting raw values in the approval scope.
-- Only allowlisted field-name characters and JSON types are surfaced. Secret-like field names are redacted.
create or replace function private.agent_execution_payload_shape(
  p_value jsonb,
  p_depth integer default 0
) returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_type text;
  v_count integer := 0;
  v_fields jsonb := '[]'::jsonb;
  v_sample jsonb;
begin
  if p_value is null then
    return jsonb_build_object('type', 'missing');
  end if;

  v_type := jsonb_typeof(p_value);
  if v_type in ('object', 'array') and greatest(coalesce(p_depth, 0), 0) >= 3 then
    return jsonb_build_object('type', v_type, 'details_omitted', true);
  end if;

  if v_type = 'object' then
    select count(*) into v_count from jsonb_object_keys(p_value);

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'field',
          case
            when e.key ~* '(password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|ssn|credit[_ -]?card|cvv|account[_ -]?number|credential)'
              then '[sensitive field]'
            when e.key ~ '^[A-Za-z][A-Za-z0-9_. -]{0,63}$'
              then e.key
            else '[field]'
          end,
          'shape', private.agent_execution_payload_shape(e.value, greatest(coalesce(p_depth, 0), 0) + 1)
        )
        order by e.key
      ),
      '[]'::jsonb
    )
    into v_fields
    from (
      select key, value
        from jsonb_each(p_value)
       order by key
       limit 12
    ) as e;

    return jsonb_build_object(
      'type', 'object',
      'fields', v_fields,
      'omitted_fields', greatest(v_count - 12, 0)
    );
  elsif v_type = 'array' then
    select value into v_sample
      from jsonb_array_elements(p_value) with ordinality as item(value, ordinality)
     order by ordinality
     limit 1;

    if not found then
      return jsonb_build_object('type', 'array', 'empty', true);
    end if;

    return jsonb_build_object(
      'type', 'array',
      'item_shape', private.agent_execution_payload_shape(v_sample, greatest(coalesce(p_depth, 0), 0) + 1),
      'sample_is_first_item', true
    );
  end if;

  return jsonb_build_object('type', coalesce(v_type, 'unknown'));
end;
$function$;

revoke all on function private.agent_execution_payload_shape(jsonb, integer)
  from public, anon, authenticated;

create or replace function private.agent_execution_approval_scope(
  p_workspace_id uuid,
  p_mission_id uuid,
  p_mission_version bigint,
  p_action_id uuid,
  p_action_version bigint,
  p_agent_id uuid,
  p_authority jsonb,
  p_request jsonb
) returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_destination text;
  v_audience text;
  v_summary text;
begin
  if p_request is null or jsonb_typeof(p_request) is distinct from 'object'
     or octet_length(convert_to(p_request::text, 'UTF8')) > 16384
     or jsonb_typeof(p_request -> 'payload') is distinct from 'object' then
    raise exception 'INVALID_AGENT_EXECUTION_APPROVAL_BINDING' using errcode = '22023';
  end if;

  if jsonb_typeof(p_request -> 'destination') is distinct from 'string'
     or jsonb_typeof(p_request -> 'audience') is distinct from 'string'
     or jsonb_typeof(p_request -> 'summary') is distinct from 'string' then
    raise exception 'INVALID_AGENT_EXECUTION_APPROVAL_BINDING' using errcode = '22023';
  end if;

  v_destination := p_request ->> 'destination';
  v_audience := p_request ->> 'audience';
  v_summary := p_request ->> 'summary';
  if nullif(btrim(v_destination), '') is null or v_destination <> btrim(v_destination)
     or char_length(v_destination) > 500
     or nullif(btrim(v_audience), '') is null or v_audience <> btrim(v_audience)
     or char_length(v_audience) > 300
     or nullif(btrim(v_summary), '') is null or v_summary <> btrim(v_summary)
     or char_length(v_summary) > 500 then
    raise exception 'INVALID_AGENT_EXECUTION_APPROVAL_BINDING' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'schema_version', 1,
    'type', 'agent_execution_binding_v1',
    'workspace_id', p_workspace_id,
    'mission_id', p_mission_id,
    'mission_version', p_mission_version,
    'action_id', p_action_id,
    'action_version', p_action_version,
    'agent_id', p_agent_id,
    'authority_hash', encode(extensions.digest(convert_to(p_authority::text, 'UTF8'), 'sha256'), 'hex'),
    'request_hash', encode(extensions.digest(convert_to(p_request::text, 'UTF8'), 'sha256'), 'hex'),
    'summary', v_summary,
    'destination', v_destination,
    'audience', v_audience,
    'payload_preview', private.agent_execution_payload_shape(p_request -> 'payload', 0)
  );
end;
$function$;

revoke all on function private.agent_execution_approval_scope(uuid,uuid,bigint,uuid,bigint,uuid,jsonb,jsonb)
  from public, anon, authenticated;
