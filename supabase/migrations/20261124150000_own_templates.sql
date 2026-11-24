-- Own templates: a person on Pro or Scale saves the shape of a Mission (its
-- name, intent, success criteria and steps) and starts new Missions from it.
--
-- Additive only: one new table, two new functions, one new trigger. Nothing
-- existing is changed or dropped.
--
-- Who may do what, enforced here and not only in the application:
--   * every row belongs to the person who saved it (owner_id comes from the
--     session through the column default; it cannot be supplied or changed);
--   * only the owner can read, rename or delete their templates;
--   * saving or changing a template needs the Pro or Scale plan, read from
--     public.ai_entitlements, which Stripe's webhooks keep current;
--   * after a downgrade the templates are kept: the owner can still read and
--     delete them, and they work again on Pro or Scale;
--   * at most 100 templates per person, as a storage safeguard.

-- 1. The plan check ---------------------------------------------------------

-- Takes no argument on purpose: it answers only for the person asking, so it
-- cannot be used to find out which plan someone else is on.
create or replace function private.has_own_templates()
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select coalesce(
    (select e.plan in ('pro', 'scale') from public.ai_entitlements e where e.user_id = auth.uid()),
    false
  );
$function$;

revoke all on function private.has_own_templates() from public, anon;
grant execute on function private.has_own_templates() to authenticated;

-- Every item of a text array is non-empty after trimming and at most p_max
-- characters. Immutable, so it can sit in a CHECK constraint.
create or replace function private.texts_within(p_items text[], p_max integer)
returns boolean
language sql
immutable
set search_path = 'pg_catalog'
as $function$
  select coalesce(bool_and(item is not null and char_length(btrim(item)) between 1 and p_max), true)
    from unnest(p_items) as item;
$function$;

-- CHECK constraints run with the privileges of whoever writes the row, so the
-- signed-in person must be able to call it. It reads nothing but its input.
revoke all on function private.texts_within(text[], integer) from public, anon;
grant execute on function private.texts_within(text[], integer) to authenticated;

-- 2. The table ----------------------------------------------------------------

create table if not exists public.user_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null
    constraint user_templates_name_shape check (char_length(name) between 1 and 200 and name = btrim(name)),
  intent text not null default ''
    constraint user_templates_intent_shape check (char_length(intent) <= 3000),
  criteria text[] not null default '{}'
    constraint user_templates_criteria_shape check (cardinality(criteria) <= 20 and private.texts_within(criteria, 500)),
  actions text[] not null
    constraint user_templates_actions_shape check (cardinality(actions) between 1 and 50 and private.texts_within(actions, 2000)),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_templates_owner_recent on public.user_templates (owner_id, updated_at desc);

drop trigger if exists user_templates_set_updated_at on public.user_templates;
create trigger user_templates_set_updated_at
before update on public.user_templates
for each row execute function private.set_updated_at();

-- 3. The storage safeguard -------------------------------------------------------

create or replace function private.enforce_user_template_limit()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
begin
  -- Two saves at the same moment must not both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('user_templates:' || new.owner_id::text, 0));
  if (select count(*) from public.user_templates t where t.owner_id = new.owner_id) >= 100 then
    raise exception 'TEMPLATE_LIMIT_REACHED' using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_user_template_limit() from public, anon, authenticated;

drop trigger if exists user_templates_limit on public.user_templates;
create trigger user_templates_limit
before insert on public.user_templates
for each row execute function private.enforce_user_template_limit();

-- 4. Access ---------------------------------------------------------------------

alter table public.user_templates enable row level security;

revoke all on public.user_templates from public, anon, authenticated;
grant select, delete on public.user_templates to authenticated;
-- Column grants: owner_id, id and the timestamps cannot be written by a client.
grant insert (name, intent, criteria, actions) on public.user_templates to authenticated;
grant update (name, intent, criteria, actions) on public.user_templates to authenticated;

drop policy if exists user_templates_select_own on public.user_templates;
create policy user_templates_select_own on public.user_templates
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists user_templates_insert_own_on_plan on public.user_templates;
create policy user_templates_insert_own_on_plan on public.user_templates
  for insert to authenticated
  with check (owner_id = auth.uid() and private.has_own_templates());

drop policy if exists user_templates_update_own_on_plan on public.user_templates;
create policy user_templates_update_own_on_plan on public.user_templates
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and private.has_own_templates());

drop policy if exists user_templates_delete_own on public.user_templates;
create policy user_templates_delete_own on public.user_templates
  for delete to authenticated
  using (owner_id = auth.uid());
