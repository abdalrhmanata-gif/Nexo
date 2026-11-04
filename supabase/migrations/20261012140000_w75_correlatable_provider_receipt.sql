-- W75: an external-side-effect success must retain a correlatable provider reference.
-- A generic "ok" status or provider name is not sufficient for reconciliation;
-- the durable receipt must contain a stable top-level scalar identifier.

create or replace function private.guard_external_execution_success_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_receipt jsonb;
  v_has_reference boolean;
begin
  if NEW.status <> 'SUCCEEDED'
     or NEW.authority_snapshot -> 'external_side_effects' is distinct from 'true'::jsonb then
    return NEW;
  end if;

  v_receipt := NEW.evidence -> 'provider_receipt';
  if jsonb_typeof(v_receipt) is distinct from 'object' then
    raise exception 'EXTERNAL_SUCCESS_PROVIDER_REFERENCE_REQUIRED' using errcode = '22023';
  end if;

  select exists (
    select 1
      from jsonb_each(v_receipt) as receipt_field(key, value)
     where receipt_field.key in ('id', 'reference', 'request_id', 'message_id', 'transaction_id', 'operation_id')
       and (
         (
           jsonb_typeof(receipt_field.value) = 'string'
           and nullif(btrim(receipt_field.value #>> '{}'), '') is not null
           and char_length(receipt_field.value #>> '{}') <= 500
         )
         or (
           jsonb_typeof(receipt_field.value) = 'number'
           and char_length(receipt_field.value #>> '{}') <= 64
         )
       )
  ) into v_has_reference;

  if not v_has_reference then
    raise exception 'EXTERNAL_SUCCESS_PROVIDER_REFERENCE_REQUIRED' using errcode = '22023';
  end if;

  return NEW;
end;
$function$;

revoke all on function private.guard_external_execution_success_receipt()
  from public, anon, authenticated, service_role;

drop trigger if exists agent_execution_success_receipt_guard on public.agent_executions;
create trigger agent_execution_success_receipt_guard
before update on public.agent_executions
for each row execute function private.guard_external_execution_success_receipt();
