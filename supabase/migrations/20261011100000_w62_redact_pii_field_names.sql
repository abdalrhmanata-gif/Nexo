-- W62: redact personal-data field names from the approval payload-shape preview.
-- Values remain omitted entirely; this extends W61's secret-like-name redaction to common PII and location fields.
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
            when e.key ~* '(password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|ssn|credit[_ -]?card|cvv|account[_ -]?number|credential|e-?mail|phone|telephone|mobile|date[_ -]?of[_ -]?birth|dob|passport|national[_ -]?id|tax[_ -]?id|bank|iban|routing[_ -]?number|address|location|latitude|longitude|gps[_ -]?coordinates?)'
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
