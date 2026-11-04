-- Schema-only snapshot generated from read-only PostgreSQL catalogs for isolated ZAVQERA browser E2E.
-- Source: ZAVQERA Development PostgreSQL 17, snapshot date 2026-10-29.
-- DDL only: no table rows, auth users, secrets, or production data.
-- Use only in the throwaway local E2E stack; never apply to a hosted Supabase project.
SET search_path = public, private, extensions;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS private;
ALTER SCHEMA public OWNER TO postgres;
ALTER SCHEMA private OWNER TO postgres;
REVOKE ALL ON SCHEMA "private" FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";
REVOKE ALL ON SCHEMA "public" FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA "public" TO "pg_database_owner";
GRANT CREATE ON SCHEMA "public" TO "pg_database_owner";
GRANT USAGE ON SCHEMA "public" TO PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
CREATE TABLE "private"."anonymous_ai_ip_windows" (
  "ip_hash" text NOT NULL,
  "window_start" date NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "private"."anonymous_ai_reservations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "visitor_hash" text NOT NULL,
  "request_id" uuid NOT NULL,
  "status" text DEFAULT 'reserved'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "settled_at" timestamp with time zone
);
CREATE TABLE "private"."anonymous_ai_visitors" (
  "visitor_hash" text NOT NULL,
  "status" text DEFAULT 'available'::text NOT NULL,
  "reservation_id" uuid,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "consumed_at" timestamp with time zone
);
CREATE TABLE "public"."agent_executions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "mission_id" uuid NOT NULL,
  "action_id" uuid,
  "agent_id" uuid NOT NULL,
  "approval_id" uuid,
  "requested_by" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text DEFAULT 'RUNNING'::text NOT NULL,
  "authority_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "request" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb,
  "evidence" jsonb,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "completed_at" timestamp with time zone,
  "heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_expires_at" timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
  "cancel_requested_at" timestamp with time zone,
  "retry_of_execution_id" uuid,
  "attempt_number" integer DEFAULT 1 NOT NULL,
  "reconciled_at" timestamp with time zone
);
CREATE TABLE "public"."ai_entitlements" (
  "user_id" uuid NOT NULL,
  "plan" text DEFAULT 'free'::text NOT NULL,
  "monthly_limit" integer DEFAULT 5 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE "public"."ai_usage_monthly" (
  "user_id" uuid NOT NULL,
  "period_start" date NOT NULL,
  "plan" text NOT NULL,
  "monthly_limit" integer DEFAULT 5 NOT NULL,
  "generations_used" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE "public"."ai_usage_reservations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "period_start" date NOT NULL,
  "request_id" text NOT NULL,
  "state" text DEFAULT 'reserved'::text NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (timezone('utc'::text, now()) + '00:02:00'::interval) NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "resolved_at" timestamp with time zone
);
CREATE TABLE "public"."mission_actions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "mission_id" uuid NOT NULL,
  "title" text NOT NULL,
  "position" integer NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "follow_up_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL
);
CREATE TABLE "public"."mission_approvals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "mission_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "action_id" uuid,
  "requested_by" uuid NOT NULL,
  "decided_by" uuid,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "requested_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "decision_note" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "decided_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "consumed_by_execution_id" uuid,
  "consumed_at" timestamp with time zone
);
CREATE TABLE "public"."mission_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "mission_id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" uuid,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE "public"."mission_outcomes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "mission_id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "verification_id" uuid NOT NULL,
  "status" text DEFAULT 'COMPLETED'::text NOT NULL,
  "result" jsonb NOT NULL,
  "success_score" numeric NOT NULL,
  "verified" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE "public"."mission_verifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "mission_id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confidence" numeric,
  "failure_reason" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "resolved_at" timestamp with time zone
);
CREATE TABLE "public"."missions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "objective" text NOT NULL,
  "status" text DEFAULT 'DRAFT'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "version" bigint DEFAULT 1 NOT NULL,
  "agent_id" uuid
);
CREATE TABLE "public"."product_growth_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "template_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."profiles" (
  "id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE "public"."workspace_activity" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "event_type" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE "public"."workspace_agents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'ACTIVE'::text NOT NULL,
  "authority" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE "public"."workspace_invitations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" text DEFAULT 'member'::text NOT NULL,
  "invited_by" uuid NOT NULL,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "accepted_at" timestamp with time zone
);
CREATE TABLE "public"."workspace_members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'member'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE TABLE "public"."workspaces" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.create_mission_verification(p_mission_id uuid, p_status text, p_criteria jsonb, p_evidence jsonb, p_confidence numeric DEFAULT NULL::numeric, p_failure_reason text DEFAULT NULL::text)
 RETURNS mission_verifications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_mission public.missions; v_verification public.mission_verifications;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if p_status not in('VERIFIED','FAILED') then raise exception 'INVALID_VERIFICATION_STATUS' using errcode='22023'; end if;
 if p_criteria is null or jsonb_typeof(p_criteria)<>'object' or p_evidence is null or jsonb_typeof(p_evidence)<>'object' then raise exception 'INVALID_VERIFICATION_PAYLOAD' using errcode='22023'; end if;
 if p_confidence is not null and (p_confidence<0 or p_confidence>1) then raise exception 'INVALID_VERIFICATION_CONFIDENCE' using errcode='22023'; end if;
 select * into v_mission from public.missions where id=p_mission_id for update;
 if not found or not private.can_edit_workspace(v_mission.workspace_id,auth.uid()) then raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if v_mission.status<>'VERIFYING' then raise exception 'MISSION_NOT_VERIFYING' using errcode='22023'; end if;
 insert into public.mission_verifications(mission_id,owner_id,status,criteria,evidence,confidence,failure_reason,resolved_at)
 values(v_mission.id,v_mission.owner_id,p_status,p_criteria,p_evidence,p_confidence,p_failure_reason,timezone('utc',now())) returning * into v_verification;
 perform public.record_mission_event(v_mission.id,'VERIFICATION_RECORDED',jsonb_build_object('verification_id',v_verification.id,'status',v_verification.status,'confidence',v_verification.confidence,'recorded_by',auth.uid()));
 return v_verification;
end; $function$;
CREATE OR REPLACE FUNCTION private.commit_verified_mission_outcome(p_mission_id uuid, p_verification_id uuid, p_result jsonb, p_success_score numeric DEFAULT 1, p_status text DEFAULT 'COMPLETED'::text)
 RETURNS mission_outcomes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_mission public.missions; v_verification public.mission_verifications; v_outcome public.mission_outcomes; v_should_complete boolean;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if p_result is null or jsonb_typeof(p_result)<>'object' then raise exception 'INVALID_OUTCOME_RESULT' using errcode='22023'; end if;
 if p_success_score is null or p_success_score<0 or p_success_score>1 then raise exception 'INVALID_OUTCOME_SCORE' using errcode='22023'; end if;
 if p_status not in('COMPLETED','FAILED') then raise exception 'INVALID_OUTCOME_STATUS' using errcode='22023'; end if;
 select * into v_mission from public.missions where id=p_mission_id for update;
 if not found or not private.can_edit_workspace(v_mission.workspace_id,auth.uid()) then raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 select * into v_verification from public.mission_verifications where id=p_verification_id and mission_id=p_mission_id for update;
 if not found then raise exception 'VERIFICATION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if v_verification.status<>'VERIFIED' then raise exception 'VERIFICATION_NOT_VERIFIED' using errcode='22023'; end if;
 if v_mission.status<>'VERIFYING' then raise exception 'MISSION_NOT_VERIFYING' using errcode='22023'; end if;
 select * into v_outcome from public.mission_outcomes where verification_id=p_verification_id for update;
 if found then return v_outcome; end if;
 if p_status='COMPLETED' and exists(select 1 from public.mission_actions where mission_id=v_mission.id and status not in('COMPLETED','CANCELLED')) then raise exception 'ALL_ACTIONS_MUST_BE_COMPLETED' using errcode='22023'; end if;
 v_should_complete:=p_status='COMPLETED';
 insert into public.mission_outcomes(mission_id,owner_id,verification_id,status,result,success_score,verified)
 values(v_mission.id,v_mission.owner_id,v_verification.id,p_status,p_result,p_success_score,true) returning * into v_outcome;
 perform public.transition_mission(v_mission.id,p_status,v_mission.version);
 perform public.record_mission_event(v_mission.id,'OUTCOME_COMMITTED',jsonb_build_object('outcome_id',v_outcome.id,'verification_id',v_verification.id,'status',v_outcome.status,'success_score',v_outcome.success_score,'mission_completed',v_should_complete,'recorded_by',auth.uid()));
 return v_outcome;
end; $function$;
CREATE OR REPLACE FUNCTION private.block_mission_history_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ begin raise exception using errcode='42501', message='Mission history is append-only'; end; $function$;
CREATE OR REPLACE FUNCTION private.transition_mission(p_mission_id uuid, p_to_status text, p_expected_version bigint)
 RETURNS missions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_mission public.missions; v_from_status text; v_allowed boolean:=false;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('zavqera:mission:'||p_mission_id::text,0));
 select * into v_mission from public.missions where id=p_mission_id for update;
 if not found or not private.can_edit_workspace(v_mission.workspace_id,auth.uid()) then raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if p_expected_version is null or p_expected_version<>v_mission.version then raise exception 'STALE_VERSION' using errcode='P0001'; end if;
 v_from_status:=v_mission.status;
 select exists(select 1 from (values
 ('DRAFT','PLANNING'),('DRAFT','CANCELLED'),('PLANNING','READY'),('PLANNING','PAUSED'),('PLANNING','BLOCKED'),('PLANNING','CANCELLED'),
 ('READY','RUNNING'),('READY','PAUSED'),('READY','BLOCKED'),('READY','CANCELLED'),('RUNNING','WAITING'),('RUNNING','NEEDS_USER'),('RUNNING','VERIFYING'),('RUNNING','PAUSED'),('RUNNING','BLOCKED'),('RUNNING','FAILED'),('RUNNING','CANCELLED'),
 ('WAITING','RUNNING'),('WAITING','NEEDS_USER'),('WAITING','PAUSED'),('WAITING','BLOCKED'),('WAITING','CANCELLED'),('NEEDS_USER','RUNNING'),('NEEDS_USER','PAUSED'),('NEEDS_USER','BLOCKED'),('NEEDS_USER','CANCELLED'),
 ('VERIFYING','COMPLETED'),('VERIFYING','FAILED'),('VERIFYING','PAUSED'),('VERIFYING','BLOCKED'),('VERIFYING','CANCELLED'),('PAUSED','RUNNING'),('PAUSED','CANCELLED'),('BLOCKED','PLANNING'),('BLOCKED','READY'),('BLOCKED','RUNNING'),('BLOCKED','CANCELLED')
 ) a(f,t) where a.f=v_from_status and a.t=p_to_status) into v_allowed;
 if not v_allowed then raise exception 'INVALID_MISSION_TRANSITION' using errcode='22023'; end if;
 if p_to_status='COMPLETED' then
  if exists(select 1 from public.mission_actions where mission_id=v_mission.id and status not in('COMPLETED','CANCELLED')) then raise exception 'ALL_ACTIONS_MUST_BE_COMPLETED' using errcode='22023'; end if;
  if not exists(select 1 from public.mission_outcomes o join public.mission_verifications v on v.id=o.verification_id where o.mission_id=v_mission.id and o.status='COMPLETED' and o.verified and v.status='VERIFIED') then raise exception 'VERIFIED_OUTCOME_REQUIRED' using errcode='22023'; end if;
 end if;
 update public.missions set status=p_to_status,version=version+1 where id=v_mission.id returning * into v_mission;
 perform public.record_mission_event(v_mission.id,'MISSION_STATUS_TRANSITION',jsonb_build_object('from_status',v_from_status,'to_status',v_mission.status,'version',v_mission.version));
 return v_mission;
end; $function$;
CREATE OR REPLACE FUNCTION private.update_mission_details(p_mission_id uuid, p_objective text, p_expected_version bigint)
 RETURNS missions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_mission public.missions;
  v_previous_objective text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_objective is null or char_length(btrim(p_objective)) not between 1 and 10000 then
    raise exception 'INVALID_OBJECTIVE' using errcode = '22023';
  end if;

  select *
    into v_mission
    from public.missions
   where id = p_mission_id
   for update;

  if not found or v_mission.owner_id <> auth.uid() then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if p_expected_version is null or p_expected_version < 1
     or p_expected_version <> v_mission.version then
    raise exception 'STALE_VERSION'
      using errcode = 'P0001',
            detail = json_build_object(
              'expected_version', p_expected_version,
              'actual_version', v_mission.version
            )::text;
  end if;

  v_previous_objective := v_mission.objective;
  update public.missions
     set objective = btrim(p_objective),
         version = version + 1
   where id = v_mission.id
  returning * into v_mission;

  perform public.record_mission_event(
    v_mission.id,
    'MISSION_OBJECTIVE_UPDATED',
    jsonb_build_object(
      'previous_objective', v_previous_objective,
      'objective', v_mission.objective,
      'version', v_mission.version
    )
  );

  return v_mission;
end;
$function$;
CREATE OR REPLACE FUNCTION public.prevent_mission_action_reparent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.mission_id is distinct from old.mission_id then
    raise exception 'ACTION_PARENT_IMMUTABLE' using errcode = '23001';
  end if;

  if not exists (
    select 1
      from public.missions
     where id = new.mission_id
  ) then
    raise exception 'ACTION_PARENT_NOT_FOUND' using errcode = '23503';
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.record_mission_event(p_mission_id uuid, p_event_type text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select owner_id
    into v_owner_id
    from public.missions
    where id = p_mission_id
      and owner_id = auth.uid();

  if not found then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.mission_events (
    mission_id,
    owner_id,
    event_type,
    actor_type,
    actor_id,
    payload
  ) values (
    p_mission_id,
    v_owner_id,
    p_event_type,
    'USER',
    auth.uid(),
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.prevent_mission_action_delete_with_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.mission_events e
    WHERE e.mission_id = OLD.mission_id
      AND e.event_type = 'ACTION_STATUS_TRANSITION'
      AND e.payload ->> 'action_id' = OLD.id::text
  ) THEN
    RAISE EXCEPTION 'ACTION_DELETE_FORBIDDEN_HISTORY'
      USING errcode = 'P0001';
  END IF;

  RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION private.transition_mission_action(p_action_id uuid, p_to_status text, p_expected_version bigint, p_follow_up_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_follow_up boolean DEFAULT false)
 RETURNS mission_actions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_action public.mission_actions; v_from_status text; v_previous_follow_up timestamptz; v_next_follow_up timestamptz; v_allowed boolean:=false;
begin
 select a.* into v_action from public.mission_actions a join public.missions m on m.id=a.mission_id where a.id=p_action_id and private.can_edit_workspace(m.workspace_id,auth.uid()) for update of a;
 if not found then raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if p_expected_version is null or p_expected_version<>v_action.version then raise exception 'STALE_VERSION' using errcode='P0001'; end if;
 v_from_status:=v_action.status; v_previous_follow_up:=v_action.follow_up_at;
 if p_set_follow_up and p_to_status<>'BLOCKED' then raise exception 'FOLLOW_UP_REQUIRES_WAITING' using errcode='22023'; end if;
 if p_set_follow_up and p_follow_up_at is not null and (p_follow_up_at<timezone('utc',now())-interval '1 day' or p_follow_up_at>timezone('utc',now())+interval '10 years') then raise exception 'FOLLOW_UP_DATE_INVALID' using errcode='22023'; end if;
 select exists(select 1 from (values('PENDING','RUNNING'),('PENDING','BLOCKED'),('PENDING','CANCELLED'),('RUNNING','COMPLETED'),('RUNNING','BLOCKED'),('RUNNING','CANCELLED'),('BLOCKED','PENDING'),('BLOCKED','CANCELLED'),('BLOCKED','RUNNING')) a(f,t) where a.f=v_from_status and a.t=p_to_status) into v_allowed;
 if not v_allowed and v_from_status='BLOCKED' and p_to_status='BLOCKED' and p_set_follow_up then v_allowed:=true; end if;
 if not v_allowed then raise exception 'INVALID_ACTION_TRANSITION' using errcode='22023'; end if;
 v_next_follow_up:=case when p_to_status<>'BLOCKED' then null when p_set_follow_up then p_follow_up_at else v_previous_follow_up end;
 update public.mission_actions set status=p_to_status,follow_up_at=v_next_follow_up,version=version+1 where id=v_action.id returning * into v_action;
 perform public.record_mission_event(v_action.mission_id,'ACTION_STATUS_TRANSITION',jsonb_build_object('action_id',v_action.id,'from_status',v_from_status,'to_status',v_action.status,'version',v_action.version));
 return v_action;
end; $function$;
CREATE OR REPLACE FUNCTION public.guard_mission_action_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select status into v_status
    from public.missions
   where id = new.mission_id and owner_id = auth.uid()
   for update;
  if not found then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'MISSION_ALREADY_COMPLETED' using errcode = '22023';
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.get_ai_usage()
 RETURNS TABLE(period_start date, plan text, monthly_limit integer, generations_used integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_plan text;
  v_limit integer;
  v_used integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select e.plan, e.monthly_limit
    into v_plan, v_limit
    from public.ai_entitlements e
   where e.user_id = v_user_id;

  v_plan := coalesce(v_plan, 'free');
  v_limit := coalesce(v_limit, 5);

  insert into public.ai_usage_monthly (
    user_id, period_start, plan, monthly_limit
  )
  values (
    v_user_id, v_period_start, v_plan, v_limit
  )
  on conflict on constraint ai_usage_monthly_pkey do nothing;

  select u.generations_used
    into v_used
    from public.ai_usage_monthly u
   where u.user_id = v_user_id
     and u.period_start = v_period_start;

  return query
  select v_period_start, v_plan, v_limit, coalesce(v_used, 0),
         greatest(v_limit - coalesce(v_used, 0), 0);
end;
$function$;
CREATE OR REPLACE FUNCTION private.reserve_ai_generation(p_request_id text)
 RETURNS TABLE(allowed boolean, reservation_id uuid, period_start date, plan text, monthly_limit integer, generations_used integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_period_start date := date_trunc('month', timezone('utc', now()))::date;
  v_plan text;
  v_limit integer;
  v_used integer;
  v_reservation_id uuid;
  v_expired_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_request_id, ''))) not between 16 and 200 then
    raise exception 'INVALID_REQUEST_ID' using errcode = '22023';
  end if;

  select e.plan, e.monthly_limit
    into v_plan, v_limit
    from public.ai_entitlements e
   where e.user_id = v_user_id;

  v_plan := coalesce(v_plan, 'free');
  v_limit := coalesce(v_limit, 5);

  insert into public.ai_usage_monthly (
    user_id, period_start, plan, monthly_limit
  )
  values (
    v_user_id, v_period_start, v_plan, v_limit
  )
  on conflict on constraint ai_usage_monthly_pkey do nothing;

  select u.generations_used
    into v_used
    from public.ai_usage_monthly u
   where u.user_id = v_user_id
     and u.period_start = v_period_start
   for update;

  delete from public.ai_usage_reservations r
   where r.user_id = v_user_id
     and r.period_start = v_period_start
     and r.state = 'reserved'
     and r.expires_at < timezone('utc', now());

  get diagnostics v_expired_count = row_count;

  if v_expired_count > 0 then
    v_used := greatest(v_used - v_expired_count, 0);
    update public.ai_usage_monthly as m
       set generations_used = v_used,
           plan = v_plan,
           monthly_limit = v_limit,
           updated_at = timezone('utc', now())
     where m.user_id = v_user_id
       and m.period_start = v_period_start;
  else
    update public.ai_usage_monthly as m
       set plan = v_plan,
           monthly_limit = v_limit,
           updated_at = timezone('utc', now())
     where m.user_id = v_user_id
       and m.period_start = v_period_start;
  end if;

  if v_used >= v_limit then
    return query
    select false, null::uuid, v_period_start, v_plan, v_limit, v_used, 0;
    return;
  end if;

  insert into public.ai_usage_reservations (
    user_id, period_start, request_id
  )
  values (
    v_user_id, v_period_start, btrim(p_request_id)
  )
  returning id into v_reservation_id;

  update public.ai_usage_monthly as m
     set generations_used = m.generations_used + 1,
         updated_at = timezone('utc', now())
   where m.user_id = v_user_id
     and m.period_start = v_period_start
  returning m.generations_used into v_used;

  return query
  select true, v_reservation_id, v_period_start, v_plan, v_limit, v_used,
         greatest(v_limit - v_used, 0);
exception
  when unique_violation then
    return query
    select false, null::uuid, v_period_start, v_plan, v_limit, v_used,
           greatest(v_limit - coalesce(v_used, 0), 0);
end;
$function$;
CREATE OR REPLACE FUNCTION private.consume_ai_generation(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.ai_usage_reservations
     set state = 'consumed',
         resolved_at = timezone('utc', now())
   where id = p_reservation_id
     and user_id = v_user_id
     and state = 'reserved';

  return found;
end;
$function$;
CREATE OR REPLACE FUNCTION private.release_ai_generation(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_period_start date;
  v_released boolean := false;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.ai_usage_reservations
     set state = 'released',
         resolved_at = timezone('utc', now())
   where id = p_reservation_id
     and user_id = v_user_id
     and state = 'reserved'
  returning period_start into v_period_start;

  if found then
    update public.ai_usage_monthly
       set generations_used = greatest(generations_used - 1, 0),
           updated_at = timezone('utc', now())
     where user_id = v_user_id
       and period_start = v_period_start;
    v_released := true;
  end if;

  return v_released;
end;
$function$;
CREATE OR REPLACE FUNCTION private.create_mission_with_actions(p_workspace_id uuid, p_objective text, p_actions jsonb DEFAULT '[]'::jsonb)
 RETURNS missions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_user_id uuid:=auth.uid(); v_mission public.missions; v_title text; v_position integer:=0;
begin
 if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if p_objective is null or char_length(btrim(p_objective))<1 or char_length(btrim(p_objective))>10000 then raise exception 'INVALID_MISSION_OBJECTIVE' using errcode='22023'; end if;
 if p_actions is null or jsonb_typeof(p_actions)<>'array' or jsonb_array_length(p_actions)>100 then raise exception 'INVALID_MISSION_ACTIONS' using errcode='22023'; end if;
 if not private.can_edit_workspace(p_workspace_id,v_user_id) then raise exception 'WORKSPACE_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 insert into public.missions(workspace_id,owner_id,objective,status) values(p_workspace_id,v_user_id,btrim(p_objective),'DRAFT') returning * into v_mission;
 for v_title in select value from jsonb_array_elements_text(p_actions) loop
  v_title:=btrim(v_title); if char_length(v_title)<1 or char_length(v_title)>2000 then raise exception 'INVALID_MISSION_ACTION_TITLE' using errcode='22023'; end if;
  insert into public.mission_actions(mission_id,title,position,status) values(v_mission.id,v_title,v_position,'PENDING'); v_position:=v_position+1;
 end loop;
 return v_mission;
end; $function$;
CREATE OR REPLACE FUNCTION public.commit_verified_mission_outcome(p_mission_id uuid, p_verification_id uuid, p_result jsonb, p_success_score numeric DEFAULT 1, p_status text DEFAULT 'COMPLETED'::text)
 RETURNS mission_outcomes
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.commit_verified_mission_outcome(
    p_mission_id, p_verification_id, p_result, p_success_score, p_status
  );
$function$;
CREATE OR REPLACE FUNCTION public.consume_ai_generation(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.consume_ai_generation(p_reservation_id);
$function$;
CREATE OR REPLACE FUNCTION public.create_mission_verification(p_mission_id uuid, p_status text, p_criteria jsonb, p_evidence jsonb, p_confidence numeric DEFAULT NULL::numeric, p_failure_reason text DEFAULT NULL::text)
 RETURNS mission_verifications
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.create_mission_verification(
    p_mission_id, p_status, p_criteria, p_evidence, p_confidence, p_failure_reason
  );
$function$;
CREATE OR REPLACE FUNCTION public.create_mission_with_actions(p_workspace_id uuid, p_objective text, p_actions jsonb DEFAULT '[]'::jsonb)
 RETURNS missions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.create_mission_with_actions(p_workspace_id, p_objective, p_actions);
$function$;
CREATE OR REPLACE FUNCTION public.get_ai_usage()
 RETURNS TABLE(period_start date, plan text, monthly_limit integer, generations_used integer, remaining integer)
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select * from private.get_ai_usage();
$function$;
CREATE OR REPLACE FUNCTION public.release_ai_generation(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.release_ai_generation(p_reservation_id);
$function$;
CREATE OR REPLACE FUNCTION public.reserve_ai_generation(p_request_id text)
 RETURNS TABLE(allowed boolean, reservation_id uuid, period_start date, plan text, monthly_limit integer, generations_used integer, remaining integer)
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select * from private.reserve_ai_generation(p_request_id);
$function$;
CREATE OR REPLACE FUNCTION public.transition_mission(p_mission_id uuid, p_to_status text, p_expected_version bigint)
 RETURNS missions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.transition_mission(p_mission_id, p_to_status, p_expected_version);
$function$;
CREATE OR REPLACE FUNCTION public.transition_mission_action(p_action_id uuid, p_to_status text, p_expected_version bigint, p_follow_up_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_set_follow_up boolean DEFAULT false)
 RETURNS mission_actions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.transition_mission_action(
    p_action_id, p_to_status, p_expected_version, p_follow_up_at, p_set_follow_up
  );
$function$;
CREATE OR REPLACE FUNCTION public.update_mission_details(p_mission_id uuid, p_objective text, p_expected_version bigint)
 RETURNS missions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.update_mission_details(p_mission_id, p_objective, p_expected_version);
$function$;
CREATE OR REPLACE FUNCTION private.reserve_anonymous_ai_generation(p_visitor_hash text, p_ip_hash text, p_request_id uuid)
 RETURNS TABLE(allowed boolean, reservation_id uuid, remaining integer, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_visitor private.anonymous_ai_visitors%rowtype;
  v_attempts integer;
  v_reservation uuid;
begin
  if length(coalesce(p_visitor_hash, '')) <> 64
     or length(coalesce(p_ip_hash, '')) <> 64 then
    return query select false, null::uuid, 0, 'invalid_identity';
    return;
  end if;

  insert into private.anonymous_ai_visitors(visitor_hash)
  values (p_visitor_hash)
  on conflict (visitor_hash) do update
    set last_seen_at = now()
  returning * into v_visitor;

  select *
    into v_visitor
    from private.anonymous_ai_visitors
   where visitor_hash = p_visitor_hash
   for update;

  if v_visitor.status <> 'available' then
    return query select false, null::uuid, 0, 'already_used';
    return;
  end if;

  insert into private.anonymous_ai_ip_windows(ip_hash, window_start, attempts)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, window_start) do update
    set attempts = private.anonymous_ai_ip_windows.attempts + 1
   where private.anonymous_ai_ip_windows.attempts < 5
  returning attempts into v_attempts;

  if v_attempts is null then
    return query select false, null::uuid, 0, 'ip_limit';
    return;
  end if;

  v_reservation := gen_random_uuid();

  insert into private.anonymous_ai_reservations(id, visitor_hash, request_id)
  values (v_reservation, p_visitor_hash, p_request_id);

  update private.anonymous_ai_visitors
     set status = 'reserved', reservation_id = v_reservation, last_seen_at = now()
   where visitor_hash = p_visitor_hash;

  return query select true, v_reservation, 0, null::text;
end;
$function$;
CREATE OR REPLACE FUNCTION private.consume_anonymous_ai_generation(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_visitor_hash text;
  v_updated integer;
begin
  update private.anonymous_ai_reservations
     set status = 'consumed', settled_at = now()
   where id = p_reservation_id and status = 'reserved'
   returning visitor_hash into v_visitor_hash;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return false;
  end if;

  update private.anonymous_ai_visitors
     set status = 'consumed', consumed_at = now(), reservation_id = p_reservation_id, last_seen_at = now()
   where visitor_hash = v_visitor_hash;

  return true;
end;
$function$;
CREATE OR REPLACE FUNCTION private.release_anonymous_ai_generation(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare
  v_visitor_hash text;
  v_updated integer;
begin
  update private.anonymous_ai_reservations
     set status = 'released', settled_at = now()
   where id = p_reservation_id and status = 'reserved'
   returning visitor_hash into v_visitor_hash;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return false;
  end if;

  update private.anonymous_ai_visitors
     set status = 'available', reservation_id = null, last_seen_at = now()
   where visitor_hash = v_visitor_hash;

  return true;
end;
$function$;
CREATE OR REPLACE FUNCTION public.reserve_anonymous_ai_generation(p_visitor_hash text, p_ip_hash text, p_request_id uuid)
 RETURNS TABLE(allowed boolean, reservation_id uuid, remaining integer, reason text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select * from private.reserve_anonymous_ai_generation(p_visitor_hash, p_ip_hash, p_request_id);
$function$;
CREATE OR REPLACE FUNCTION public.consume_anonymous_ai_generation(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select private.consume_anonymous_ai_generation(p_reservation_id);
$function$;
CREATE OR REPLACE FUNCTION public.release_anonymous_ai_generation(p_reservation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select private.release_anonymous_ai_generation(p_reservation_id);
$function$;
CREATE OR REPLACE FUNCTION public.record_mission_event(p_mission_id uuid, p_event_type text, p_payload jsonb)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.record_mission_event(p_mission_id, p_event_type, p_payload);
$function$;
CREATE OR REPLACE FUNCTION private.is_workspace_member(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$ select exists(select 1 from public.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id=p_user_id); $function$;
CREATE OR REPLACE FUNCTION private.workspace_role(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$ select wm.role from public.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id=p_user_id limit 1; $function$;
CREATE OR REPLACE FUNCTION private.can_edit_workspace(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$ select private.workspace_role(p_workspace_id,p_user_id) in ('owner','admin','member'); $function$;
CREATE OR REPLACE FUNCTION private.request_mission_approval(p_mission_id uuid, p_action_id uuid, p_scope jsonb)
 RETURNS mission_approvals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_mission public.missions;
  v_action public.mission_actions;
  v_agent public.workspace_agents;
  v_approval public.mission_approvals;
  v_scope jsonb;
  v_request jsonb;
  v_agent_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_scope is null or jsonb_typeof(p_scope) <> 'object' then
    raise exception 'INVALID_APPROVAL_SCOPE' using errcode = '22023';
  end if;

  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found or not private.can_edit_workspace(v_mission.workspace_id, auth.uid()) then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if p_action_id is not null then
    select * into v_action
      from public.mission_actions
     where id = p_action_id and mission_id = p_mission_id
     for share;
    if not found then
      raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  v_scope := p_scope;
  v_expires_at := null;

  if p_scope ->> 'type' = 'agent_execution_binding_v1' then
    if p_scope ->> 'schema_version' is distinct from '1'
       or (p_scope - array['schema_version', 'type', 'agent_id', 'request']) <> '{}'::jsonb
       or jsonb_typeof(p_scope -> 'request') is distinct from 'object' then
      raise exception 'INVALID_APPROVAL_SCOPE' using errcode = '22023';
    end if;

    begin
      v_agent_id := (p_scope ->> 'agent_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_APPROVAL_SCOPE' using errcode = '22023';
    end;

    select * into v_agent
      from public.workspace_agents
     where id = v_agent_id
       and workspace_id = v_mission.workspace_id
       and status = 'ACTIVE'
     for share;
    if not found then
      raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
    if coalesce((v_agent.authority ->> 'requires_approval')::boolean, false) is not true then
      raise exception 'APPROVAL_NOT_REQUIRED' using errcode = '22023';
    end if;

    v_request := p_scope -> 'request';
    v_scope := private.agent_execution_approval_scope(
      v_mission.workspace_id,
      v_mission.id,
      v_mission.version,
      p_action_id,
      case when p_action_id is null then null else v_action.version end,
      v_agent.id,
      v_agent.authority,
      v_request
    );
    -- Exact execution approvals expire after 24 hours. Generic collaboration
    -- approvals retain their existing semantics and do not authorize execution.
    v_expires_at := clock_timestamp() + interval '24 hours';
    v_scope := jsonb_set(v_scope, '{expires_at}', to_jsonb(v_expires_at), true);
  end if;

  if exists (
    select 1
      from public.mission_approvals
     where mission_id = p_mission_id
       and status = 'PENDING'
       and (expires_at is null or expires_at > clock_timestamp())
  ) then
    raise exception 'APPROVAL_ALREADY_PENDING' using errcode = '22023';
  end if;

  insert into public.mission_approvals(
    mission_id, workspace_id, action_id, requested_by, status, requested_scope, expires_at
  )
  values (
    v_mission.id, v_mission.workspace_id, p_action_id, auth.uid(), 'PENDING', v_scope, v_expires_at
  )
  returning * into v_approval;

  perform public.record_mission_event(
    v_mission.id,
    'APPROVAL_REQUESTED',
    jsonb_build_object(
      'approval_id', v_approval.id,
      'action_id', p_action_id,
      'requested_by', auth.uid(),
      'expires_at', v_approval.expires_at,
      'scope_type', v_scope ->> 'type',
      'scope_schema_version', v_scope -> 'schema_version'
    )
  );
  return v_approval;
end;
$function$;
CREATE OR REPLACE FUNCTION private.decide_mission_approval(p_approval_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS mission_approvals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_approval public.mission_approvals;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED', 'CANCELLED') then
    raise exception 'INVALID_APPROVAL_DECISION' using errcode = '22023';
  end if;

  select * into v_approval from public.mission_approvals where id = p_approval_id for update;
  if not found or private.workspace_role(v_approval.workspace_id) not in ('owner', 'admin') then
    raise exception 'APPROVAL_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_approval.status <> 'PENDING' then
    raise exception 'APPROVAL_ALREADY_DECIDED' using errcode = '22023';
  end if;
  if v_approval.expires_at is not null and v_approval.expires_at <= clock_timestamp() then
    raise exception 'APPROVAL_EXPIRED' using errcode = '22023';
  end if;

  update public.mission_approvals
     set status = p_decision,
         decided_by = auth.uid(),
         decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_at = clock_timestamp()
   where id = v_approval.id
   returning * into v_approval;

  perform public.record_mission_event(
    v_approval.mission_id,
    'APPROVAL_DECIDED',
    jsonb_build_object(
      'approval_id', v_approval.id,
      'status', v_approval.status,
      'decided_by', auth.uid(),
      'expires_at', v_approval.expires_at
    )
  );
  return v_approval;
end;
$function$;
CREATE OR REPLACE FUNCTION public.request_mission_approval(p_mission_id uuid, p_action_id uuid, p_scope jsonb)
 RETURNS mission_approvals
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select private.request_mission_approval(p_mission_id,p_action_id,p_scope); $function$;
CREATE OR REPLACE FUNCTION public.decide_mission_approval(p_approval_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS mission_approvals
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select private.decide_mission_approval(p_approval_id,p_decision,p_note); $function$;
CREATE OR REPLACE FUNCTION private.start_agent_execution(p_mission_id uuid, p_action_id uuid, p_agent_id uuid, p_idempotency_key text, p_request jsonb DEFAULT '{}'::jsonb)
 RETURNS agent_executions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_mission public.missions;
  v_agent public.workspace_agents;
  v_action public.mission_actions;
  v_approval public.mission_approvals;
  v_execution public.agent_executions;
  v_requires_approval boolean;
  v_expected_scope jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) < 16 or char_length(p_idempotency_key) > 200 then
    raise exception 'INVALID_EXECUTION_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'INVALID_EXECUTION_REQUEST' using errcode = '22023';
  end if;

  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found or not private.can_edit_workspace(v_mission.workspace_id) then
    raise exception 'MISSION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_mission.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'MISSION_CLOSED' using errcode = '22023';
  end if;

  select * into v_agent
    from public.workspace_agents
   where id = p_agent_id and workspace_id = v_mission.workspace_id and status = 'ACTIVE'
   for share;
  if not found then
    raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if p_action_id is not null then
    select * into v_action
      from public.mission_actions
     where id = p_action_id and mission_id = v_mission.id
     for update;
    if not found then
      raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  select * into v_execution
    from public.agent_executions
   where workspace_id = v_mission.workspace_id and idempotency_key = p_idempotency_key
   for update;
  if found then
    if v_execution.mission_id <> v_mission.id
       or v_execution.agent_id <> v_agent.id
       or coalesce(v_execution.action_id, '00000000-0000-0000-0000-000000000000')
          <> coalesce(p_action_id, '00000000-0000-0000-0000-000000000000')
       or v_execution.request is distinct from p_request then
      raise exception 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' using errcode = '22023';
    end if;
    -- Replays never imply permission to dispatch the existing attempt again.
    raise exception 'EXECUTION_ALREADY_EXISTS' using errcode = '22023';
  end if;

  v_requires_approval := coalesce((v_agent.authority ->> 'requires_approval')::boolean, false);
  if v_requires_approval then
    v_expected_scope := private.agent_execution_approval_scope(
      v_mission.workspace_id,
      v_mission.id,
      v_mission.version,
      p_action_id,
      case when p_action_id is null then null else v_action.version end,
      v_agent.id,
      v_agent.authority,
      p_request
    );

    select * into v_approval
      from public.mission_approvals
     where mission_id = v_mission.id
       and workspace_id = v_mission.workspace_id
       and action_id is not distinct from p_action_id
       and status = 'APPROVED'
       and decided_at is not null
       and expires_at > clock_timestamp()
       and consumed_by_execution_id is null
       and consumed_at is null
       and (requested_scope - 'expires_at') = v_expected_scope
       and (requested_scope ->> 'expires_at')::timestamptz = expires_at
     order by decided_at desc nulls last
     limit 1
     for update;

    if not found then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
  end if;

  insert into public.agent_executions(
    workspace_id, mission_id, action_id, agent_id, approval_id, requested_by,
    idempotency_key, status, authority_snapshot, request
  )
  values (
    v_mission.workspace_id, v_mission.id, p_action_id, v_agent.id,
    case when v_requires_approval then v_approval.id else null end,
    auth.uid(), p_idempotency_key, 'RUNNING', v_agent.authority, p_request
  )
  returning * into v_execution;

  if v_requires_approval then
    update public.mission_approvals
       set consumed_by_execution_id = v_execution.id,
           consumed_at = clock_timestamp()
     where id = v_approval.id
       and status = 'APPROVED'
       and consumed_by_execution_id is null
       and consumed_at is null
       and expires_at > clock_timestamp();
    if not found then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
  end if;

  perform public.record_mission_event(
    v_mission.id,
    'AGENT_EXECUTION_STARTED',
    jsonb_build_object(
      'execution_id', v_execution.id,
      'agent_id', v_agent.id,
      'action_id', p_action_id,
      'approval_id', v_execution.approval_id,
      'idempotency_key', p_idempotency_key
    )
  );
  return v_execution;
end;
$function$;
CREATE OR REPLACE FUNCTION private.complete_agent_execution(p_execution_id uuid, p_status text, p_result jsonb DEFAULT NULL::jsonb, p_evidence jsonb DEFAULT NULL::jsonb, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text)
 RETURNS agent_executions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_execution public.agent_executions;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'TRUSTED_EXECUTOR_REQUIRED' using errcode = '42501';
  end if;

  if p_status not in ('SUCCEEDED', 'FAILED', 'UNKNOWN', 'BLOCKED') then
    raise exception 'INVALID_EXECUTION_STATUS' using errcode = '22023';
  end if;
  if p_result is not null and jsonb_typeof(p_result) <> 'object' then
    raise exception 'INVALID_EXECUTION_RESULT' using errcode = '22023';
  end if;
  if p_evidence is not null and jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'INVALID_EXECUTION_EVIDENCE' using errcode = '22023';
  end if;
  if p_status = 'SUCCEEDED'
     and (
       p_evidence is null
       or not (p_evidence ? 'provider_receipt')
       or not private.agent_execution_has_meaningful_value(p_evidence -> 'provider_receipt', 0)
     ) then
    raise exception 'PROVIDER_RECEIPT_REQUIRED' using errcode = '22023';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;

  if not found then
    raise exception 'EXECUTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_execution.status <> 'RUNNING' then
    return v_execution;
  end if;

  -- Sample time after the row lock. Once the lease has expired, a late worker
  -- cannot convert an uncertain outcome into a final result.
  v_now := clock_timestamp();
  if v_execution.lease_expires_at <= v_now then
    raise exception 'EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION' using errcode = '22023';
  end if;

  update public.agent_executions
     set status = p_status,
         result = p_result,
         evidence = p_evidence,
         error_code = nullif(btrim(coalesce(p_error_code, '')), ''),
         error_message = nullif(btrim(coalesce(p_error_message, '')), ''),
         completed_at = v_now
   where id = v_execution.id
   returning * into v_execution;

  perform public.record_mission_event(
    v_execution.mission_id,
    'AGENT_EXECUTION_COMPLETED',
    jsonb_build_object(
      'execution_id', v_execution.id,
      'agent_id', v_execution.agent_id,
      'action_id', v_execution.action_id,
      'status', v_execution.status,
      'approval_id', v_execution.approval_id
    )
  );

  return v_execution;
end;
$function$;
CREATE OR REPLACE FUNCTION public.start_agent_execution(p_mission_id uuid, p_action_id uuid, p_agent_id uuid, p_idempotency_key text, p_request jsonb DEFAULT '{}'::jsonb)
 RETURNS agent_executions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select private.start_agent_execution(p_mission_id,p_action_id,p_agent_id,p_idempotency_key,p_request); $function$;
CREATE OR REPLACE FUNCTION public.complete_agent_execution(p_execution_id uuid, p_status text, p_result jsonb DEFAULT NULL::jsonb, p_evidence jsonb DEFAULT NULL::jsonb, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text)
 RETURNS agent_executions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select private.complete_agent_execution(p_execution_id,p_status,p_result,p_evidence,p_error_code,p_error_message); $function$;
CREATE OR REPLACE FUNCTION private.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role text, p_token_hash text, p_expires_at timestamp with time zone)
 RETURNS workspace_invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_inv public.workspace_invitations; v_email text:=lower(btrim(p_email));
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if private.workspace_role(p_workspace_id) not in ('owner','admin') then raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501'; end if;
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_INVITATION_EMAIL' using errcode='22023'; end if;
 if p_role not in ('admin','member','viewer') then raise exception 'INVALID_INVITATION_ROLE' using errcode='22023'; end if;
 if p_token_hash is null or char_length(p_token_hash)<>64 then raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023'; end if;
 if p_expires_at <= timezone('utc',now()) then raise exception 'INVITATION_EXPIRED' using errcode='22023'; end if;
 if exists(select 1 from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace_id and lower(u.email)=v_email) then raise exception 'USER_ALREADY_MEMBER' using errcode='22023'; end if;
 if exists(select 1 from public.workspace_invitations where workspace_id=p_workspace_id and lower(email)=v_email and status='PENDING') then raise exception 'INVITATION_ALREADY_PENDING' using errcode='22023'; end if;
 insert into public.workspace_invitations(workspace_id,email,role,invited_by,token_hash,expires_at)
 values(p_workspace_id,v_email,p_role,auth.uid(),p_token_hash,p_expires_at) returning * into v_inv;
 perform private.record_workspace_activity(p_workspace_id,'WORKSPACE_INVITATION_CREATED','workspace_invitation',v_inv.id,jsonb_build_object('email',v_email,'role',p_role));
 return v_inv;
end; $function$;
CREATE OR REPLACE FUNCTION public.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role text, p_token_hash text, p_expires_at timestamp with time zone)
 RETURNS workspace_invitations
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select private.create_workspace_invitation(p_workspace_id,p_email,p_role,p_token_hash,p_expires_at); $function$;
CREATE OR REPLACE FUNCTION private.get_workspace_invitation(p_token_hash text)
 RETURNS TABLE(id uuid, email text, role text, status text, expires_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
 if p_token_hash is null or char_length(p_token_hash) <> 64 then raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023'; end if;
 update public.workspace_invitations set status='EXPIRED' where token_hash=p_token_hash and status='PENDING' and expires_at <= timezone('utc',now());
 return query select wi.id,wi.email,wi.role,wi.status,wi.expires_at,wi.created_at from public.workspace_invitations wi where wi.token_hash=p_token_hash limit 1;
end; $function$;
CREATE OR REPLACE FUNCTION public.get_workspace_invitation(p_token_hash text)
 RETURNS TABLE(id uuid, email text, role text, status text, expires_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select * from private.get_workspace_invitation(p_token_hash); $function$;
CREATE OR REPLACE FUNCTION private.accept_workspace_invitation(p_token_hash text)
 RETURNS workspace_invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_inv public.workspace_invitations; v_email text;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 if p_token_hash is null or char_length(p_token_hash)<>64 then raise exception 'INVALID_INVITATION_TOKEN' using errcode='22023'; end if;
 select * into v_inv from public.workspace_invitations where token_hash=p_token_hash for update;
 if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='22023'; end if;
 if v_inv.status<>'PENDING' then raise exception 'INVITATION_NOT_PENDING' using errcode='22023'; end if;
 if v_inv.expires_at<=timezone('utc',now()) then update public.workspace_invitations set status='EXPIRED' where id=v_inv.id; raise exception 'INVITATION_EXPIRED' using errcode='22023'; end if;
 select email into v_email from auth.users where id=auth.uid();
 if v_email is null or lower(v_email)<>lower(v_inv.email) then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode='42501'; end if;
 if exists(select 1 from public.workspace_members where workspace_id=v_inv.workspace_id and user_id=auth.uid()) then raise exception 'USER_ALREADY_MEMBER' using errcode='22023'; end if;
 insert into public.workspace_members(workspace_id,user_id,role) values(v_inv.workspace_id,auth.uid(),v_inv.role);
 update public.workspace_invitations set status='ACCEPTED',accepted_at=timezone('utc',now()) where id=v_inv.id returning * into v_inv;
 perform private.record_workspace_activity(v_inv.workspace_id,'WORKSPACE_INVITATION_ACCEPTED','workspace_invitation',v_inv.id,jsonb_build_object('user_id',auth.uid(),'role',v_inv.role));
 return v_inv;
end; $function$;
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(p_token_hash text)
 RETURNS workspace_invitations
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select private.accept_workspace_invitation(p_token_hash); $function$;
CREATE OR REPLACE FUNCTION private.revoke_workspace_invitation(p_invitation_id uuid)
 RETURNS workspace_invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_inv public.workspace_invitations;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
 select * into v_inv from public.workspace_invitations where id=p_invitation_id for update;
 if not found then raise exception 'INVITATION_NOT_FOUND' using errcode='22023'; end if;
 if private.workspace_role(v_inv.workspace_id) not in ('owner','admin') then raise exception 'WORKSPACE_ADMIN_REQUIRED' using errcode='42501'; end if;
 if v_inv.status<>'PENDING' then raise exception 'INVITATION_NOT_PENDING' using errcode='22023'; end if;
 update public.workspace_invitations set status='REVOKED' where id=v_inv.id returning * into v_inv;
 perform private.record_workspace_activity(v_inv.workspace_id,'WORKSPACE_INVITATION_REVOKED','workspace_invitation',v_inv.id,jsonb_build_object('role',v_inv.role));
 return v_inv;
end; $function$;
CREATE OR REPLACE FUNCTION public.revoke_workspace_invitation(p_invitation_id uuid)
 RETURNS workspace_invitations
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select private.revoke_workspace_invitation(p_invitation_id); $function$;
CREATE OR REPLACE FUNCTION private.list_workspace_members(p_workspace_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, email text, role text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if auth.uid() is null or private.workspace_role(p_workspace_id,auth.uid()) is null then
    raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501';
  end if;
  return query
    select wm.id,wm.user_id,au.email::text,wm.role,wm.created_at
    from public.workspace_members wm
    join auth.users au on au.id=wm.user_id
    where wm.workspace_id=p_workspace_id
    order by wm.created_at;
end; $function$;
CREATE OR REPLACE FUNCTION public.list_workspace_members(p_workspace_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, email text, role text, created_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select * from private.list_workspace_members(p_workspace_id);
$function$;
CREATE OR REPLACE FUNCTION private.update_workspace_member_role(p_member_id uuid, p_role text)
 RETURNS workspace_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_member public.workspace_members; v_actor_role text; v_owner_id uuid; v_old_role text;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if p_role not in ('admin','member','viewer','owner') then raise exception 'INVALID_MEMBER_ROLE' using errcode='22023'; end if;
  select * into v_member from public.workspace_members where id=p_member_id for update;
  if not found then raise exception 'MEMBER_NOT_FOUND' using errcode='22023'; end if;
  v_old_role:=v_member.role; v_actor_role:=private.workspace_role(v_member.workspace_id,auth.uid());
  select owner_id into v_owner_id from public.workspaces where id=v_member.workspace_id;
  if v_actor_role is null then raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501'; end if;
  if v_member.user_id=auth.uid() and p_role='owner' and v_member.role<>'owner' then raise exception 'SELF_OWNER_ESCALATION_FORBIDDEN' using errcode='42501'; end if;
  if v_actor_role<>'owner' and v_member.role='owner' then raise exception 'OWNER_PROTECTED' using errcode='42501'; end if;
  if v_actor_role<>'owner' and p_role='owner' then raise exception 'OWNER_ESCALATION_FORBIDDEN' using errcode='42501'; end if;
  if v_member.role='owner' and p_role<>'owner' and v_member.user_id=v_owner_id then raise exception 'OWNER_PROTECTED' using errcode='42501'; end if;
  update public.workspace_members set role=p_role,updated_at=timezone('utc',now()) where id=v_member.id returning * into v_member;
  perform private.record_workspace_activity(v_member.workspace_id,'MEMBER_ROLE_CHANGED','workspace_member',v_member.id,jsonb_build_object('user_id',v_member.user_id,'from_role',v_old_role,'to_role',p_role));
  return v_member;
end; $function$;
CREATE OR REPLACE FUNCTION public.update_workspace_member_role(p_member_id uuid, p_role text)
 RETURNS workspace_members
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select * from private.update_workspace_member_role(p_member_id,p_role);
$function$;
CREATE OR REPLACE FUNCTION private.remove_workspace_member(p_member_id uuid)
 RETURNS workspace_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_member public.workspace_members; v_actor_role text; v_owner_id uuid; v_owner_count integer;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select * into v_member from public.workspace_members where id=p_member_id for update;
  if not found then raise exception 'MEMBER_NOT_FOUND' using errcode='22023'; end if;
  v_actor_role:=private.workspace_role(v_member.workspace_id,auth.uid());
  select owner_id into v_owner_id from public.workspaces where id=v_member.workspace_id;
  if v_actor_role is null then raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501'; end if;
  if v_member.role='owner' then
    if v_actor_role<>'owner' then raise exception 'OWNER_PROTECTED' using errcode='42501'; end if;
    select count(*) into v_owner_count from public.workspace_members where workspace_id=v_member.workspace_id and role='owner';
    if v_owner_count<=1 then raise exception 'LAST_OWNER_PROTECTED' using errcode='42501'; end if;
    if v_member.user_id=v_owner_id then raise exception 'WORKSPACE_OWNER_PROTECTED' using errcode='42501'; end if;
  end if;
  if v_actor_role<>'owner' and v_member.user_id<>auth.uid() and v_member.role in ('admin','owner') then raise exception 'PRIVILEGED_MEMBER_PROTECTED' using errcode='42501'; end if;
  delete from public.workspace_members where id=v_member.id;
  perform private.record_workspace_activity(v_member.workspace_id,'MEMBER_REMOVED','workspace_member',v_member.id,jsonb_build_object('user_id',v_member.user_id,'role',v_member.role));
  return v_member;
end; $function$;
CREATE OR REPLACE FUNCTION public.remove_workspace_member(p_member_id uuid)
 RETURNS workspace_members
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select * from private.remove_workspace_member(p_member_id);
$function$;
CREATE OR REPLACE FUNCTION private.record_workspace_activity(p_workspace_id uuid, p_event_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id uuid;
begin
  if auth.uid() is null or private.workspace_role(p_workspace_id,auth.uid()) is null then
    raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501';
  end if;
  insert into public.workspace_activity(workspace_id,actor_user_id,event_type,entity_type,entity_id,payload)
  values(p_workspace_id,auth.uid(),p_event_type,p_entity_type,p_entity_id,coalesce(p_payload,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end; $function$;
CREATE OR REPLACE FUNCTION public.list_workspace_activity(p_workspace_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, event_type text, entity_type text, entity_id uuid, payload jsonb, actor_user_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select * from private.list_workspace_activity(p_workspace_id,p_limit);
$function$;
CREATE OR REPLACE FUNCTION private.list_workspace_activity(p_workspace_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, event_type text, entity_type text, entity_id uuid, payload jsonb, actor_user_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
 if auth.uid() is null or private.workspace_role(p_workspace_id,auth.uid()) is null then raise exception 'WORKSPACE_ACCESS_REQUIRED' using errcode='42501'; end if;
 return query select x.id,x.event_type,x.entity_type,x.entity_id,x.payload,x.actor_user_id,x.created_at
 from (
  select wa.id,wa.event_type,wa.entity_type,wa.entity_id,wa.payload,wa.actor_user_id,wa.created_at from public.workspace_activity wa where wa.workspace_id=p_workspace_id
  union all
  select me.id,me.event_type,'mission',me.mission_id,me.payload,null::uuid,me.created_at from public.mission_events me join public.missions m on m.id=me.mission_id where m.workspace_id=p_workspace_id
 ) x order by x.created_at desc limit greatest(1,least(coalesce(p_limit,50),200));
end; $function$;
CREATE OR REPLACE FUNCTION private.ensure_owned_workspace()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select w.id
    into v_workspace_id
    from public.workspaces as w
   where w.owner_id = v_user_id
   order by w.created_at asc, w.id asc
   limit 1
   for update;

  if v_workspace_id is null then
    insert into public.workspaces (owner_id, name)
    values (v_user_id, 'My workspace')
    returning id into v_workspace_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner')
  on conflict (workspace_id, user_id)
  do update set role = 'owner', updated_at = now();

  insert into public.workspace_agents
    (workspace_id, name, description, status, authority, created_by)
  select
    v_workspace_id,
    'ZAVQERA Research Agent',
    'Bounded read-only research agent. It can gather public information but cannot purchase, book, contact people, submit forms, or change accounts.',
    'ACTIVE',
    jsonb_build_object(
      'mode', 'read_only',
      'external_side_effects', false,
      'requires_approval', false
    ),
    v_user_id
  where not exists (
    select 1
      from public.workspace_agents as a
     where a.workspace_id = v_workspace_id
       and a.name = 'ZAVQERA Research Agent'
  );

  return v_workspace_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.ensure_owned_workspace()
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select private.ensure_owned_workspace();
$function$;
CREATE OR REPLACE FUNCTION private.heartbeat_agent_execution(p_execution_id uuid)
 RETURNS agent_executions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_execution public.agent_executions;
  v_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;

  if not found or not private.can_edit_workspace(v_execution.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_execution.status <> 'RUNNING' then
    raise exception 'EXECUTION_NOT_RUNNING' using errcode = '22023';
  end if;

  -- Sample wall-clock time only after acquiring the row lock. now() would
  -- remain fixed at transaction start and could revive a lease that expired
  -- while this statement waited for another worker/reconciler.
  v_now := clock_timestamp();
  if v_execution.lease_expires_at <= v_now then
    raise exception 'EXECUTION_LEASE_EXPIRED' using errcode = '22023';
  end if;

  update public.agent_executions
     set heartbeat_at = v_now,
         lease_expires_at = v_now + interval '5 minutes'
   where id = v_execution.id
   returning * into v_execution;

  return v_execution;
end;
$function$;
CREATE OR REPLACE FUNCTION private.request_agent_execution_cancellation(p_execution_id uuid)
 RETURNS agent_executions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_execution public.agent_executions;
  v_new_request boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;

  if not found or not private.can_edit_workspace(v_execution.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_execution.status <> 'RUNNING' then
    raise exception 'EXECUTION_NOT_RUNNING' using errcode = '22023';
  end if;

  if v_execution.cancel_requested_at is null then
    update public.agent_executions
       set cancel_requested_at = now()
     where id = v_execution.id
     returning * into v_execution;
    v_new_request := true;
  end if;

  if v_new_request then
    perform public.record_mission_event(
      v_execution.mission_id,
      'AGENT_EXECUTION_CANCEL_REQUESTED',
      jsonb_build_object(
        'execution_id', v_execution.id,
        'status', v_execution.status,
        'cancel_requested_at', v_execution.cancel_requested_at
      )
    );
  end if;

  return v_execution;
end;
$function$;
CREATE OR REPLACE FUNCTION private.reconcile_stale_agent_execution(p_execution_id uuid)
 RETURNS agent_executions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_execution public.agent_executions;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;

  if not found or private.workspace_role(v_execution.workspace_id) not in ('owner', 'admin') then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_execution.status <> 'RUNNING' then
    raise exception 'EXECUTION_NOT_RUNNING' using errcode = '22023';
  end if;
  if v_execution.lease_expires_at > v_now then
    raise exception 'EXECUTION_LEASE_NOT_EXPIRED' using errcode = '22023';
  end if;

  update public.agent_executions
     set status = 'UNKNOWN',
         error_code = 'EXECUTION_LEASE_EXPIRED',
         error_message = 'No confirmed completion arrived before the execution lease expired.',
         evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
           'outcome', 'unknown',
           'safe_to_retry', false,
           'reconciliation_reason', 'lease_expired',
           'cancel_requested', cancel_requested_at is not null,
           'reconciled_at', v_now
         ),
         reconciled_at = v_now,
         completed_at = v_now
   where id = v_execution.id
   returning * into v_execution;

  perform public.record_mission_event(
    v_execution.mission_id,
    'AGENT_EXECUTION_RECONCILED',
    jsonb_build_object(
      'execution_id', v_execution.id,
      'status', 'UNKNOWN',
      'error_code', 'EXECUTION_LEASE_EXPIRED',
      'safe_to_retry', false,
      'reconciled_at', v_now
    )
  );

  return v_execution;
end;
$function$;
CREATE OR REPLACE FUNCTION private.retry_agent_execution(p_execution_id uuid, p_new_idempotency_key text)
 RETURNS agent_executions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_initial public.agent_executions;
  v_execution public.agent_executions;
  v_existing public.agent_executions;
  v_mission public.missions;
  v_agent public.workspace_agents;
  v_action public.mission_actions;
  v_approval public.mission_approvals;
  v_requires_approval boolean;
  v_expected_scope jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_new_idempotency_key is null
     or char_length(btrim(p_new_idempotency_key)) < 16
     or char_length(p_new_idempotency_key) > 200 then
    raise exception 'INVALID_EXECUTION_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  select * into v_initial from public.agent_executions where id = p_execution_id;
  if not found or not private.can_edit_workspace(v_initial.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_mission
    from public.missions
   where id = v_initial.mission_id
   for update;
  if not found or v_mission.workspace_id <> v_initial.workspace_id then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;
  if not found or not private.can_edit_workspace(v_execution.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_existing
    from public.agent_executions
   where workspace_id = v_execution.workspace_id
     and idempotency_key = btrim(p_new_idempotency_key)
   for update;
  if found then
    if v_existing.retry_of_execution_id = v_execution.id
       and v_existing.mission_id = v_execution.mission_id
       and v_existing.agent_id = v_execution.agent_id
       and v_existing.action_id is not distinct from v_execution.action_id then
      raise exception 'EXECUTION_ALREADY_EXISTS' using errcode = '22023';
    end if;
    raise exception 'EXECUTION_IDEMPOTENCY_BINDING_MISMATCH' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.agent_executions e where e.retry_of_execution_id = v_execution.id
  ) then
    raise exception 'EXECUTION_RETRY_ALREADY_CREATED' using errcode = '22023';
  end if;
  if v_execution.status = 'UNKNOWN' then
    raise exception 'EXECUTION_OUTCOME_UNKNOWN_NOT_RETRYABLE' using errcode = '22023';
  end if;
  if v_execution.status not in ('FAILED', 'BLOCKED') then
    raise exception 'EXECUTION_STATUS_NOT_RETRYABLE' using errcode = '22023';
  end if;
  if v_mission.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'MISSION_CLOSED' using errcode = '22023';
  end if;

  select * into v_agent
    from public.workspace_agents
   where id = v_execution.agent_id
     and workspace_id = v_execution.workspace_id
     and status = 'ACTIVE'
   for share;
  if not found then
    raise exception 'AGENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if v_agent.authority is distinct from v_execution.authority_snapshot then
    raise exception 'AGENT_AUTHORITY_CHANGED' using errcode = '22023';
  end if;

  if v_execution.action_id is not null then
    select * into v_action
      from public.mission_actions
     where id = v_execution.action_id and mission_id = v_execution.mission_id
     for share;
    if not found then
      raise exception 'ACTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  v_requires_approval := coalesce((v_agent.authority ->> 'requires_approval')::boolean, false);
  if v_requires_approval then
    v_expected_scope := private.agent_execution_approval_scope(
      v_mission.workspace_id,
      v_mission.id,
      v_mission.version,
      v_execution.action_id,
      case when v_execution.action_id is null then null else v_action.version end,
      v_agent.id,
      v_agent.authority,
      v_execution.request
    );

    select * into v_approval
      from public.mission_approvals a
     where a.id = v_execution.approval_id
       and a.mission_id = v_execution.mission_id
       and a.workspace_id = v_execution.workspace_id
       and a.action_id is not distinct from v_execution.action_id
       and a.status = 'APPROVED'
       and a.decided_at is not null
       and a.expires_at > clock_timestamp()
       and (a.requested_scope - 'expires_at') = v_expected_scope
       and (a.requested_scope ->> 'expires_at')::timestamptz = a.expires_at
       and a.consumed_by_execution_id in (
         with recursive execution_chain(id, retry_of_execution_id) as (
           select e.id, e.retry_of_execution_id
             from public.agent_executions e
            where e.id = v_execution.id
           union all
           select parent.id, parent.retry_of_execution_id
             from public.agent_executions parent
             join execution_chain child on child.retry_of_execution_id = parent.id
         )
         select id from execution_chain
       )
     for share;

    if not found then
      raise exception 'APPROVAL_REQUIRED' using errcode = '42501';
    end if;
  end if;

  insert into public.agent_executions(
    workspace_id, mission_id, action_id, agent_id, approval_id, requested_by,
    idempotency_key, status, authority_snapshot, request, retry_of_execution_id, attempt_number
  )
  values (
    v_execution.workspace_id, v_execution.mission_id, v_execution.action_id,
    v_execution.agent_id, case when v_requires_approval then v_approval.id else null end,
    auth.uid(), btrim(p_new_idempotency_key), 'RUNNING', v_agent.authority,
    v_execution.request, v_execution.id, v_execution.attempt_number + 1
  )
  returning * into v_existing;

  perform public.record_mission_event(
    v_existing.mission_id,
    'AGENT_EXECUTION_RETRY_STARTED',
    jsonb_build_object(
      'execution_id', v_existing.id,
      'previous_execution_id', v_execution.id,
      'attempt_number', v_existing.attempt_number,
      'agent_id', v_existing.agent_id,
      'action_id', v_existing.action_id,
      'approval_id', v_existing.approval_id
    )
  );
  return v_existing;
end;
$function$;
CREATE OR REPLACE FUNCTION public.heartbeat_agent_execution(p_execution_id uuid)
 RETURNS agent_executions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select private.heartbeat_agent_execution(p_execution_id); $function$;
CREATE OR REPLACE FUNCTION public.request_agent_execution_cancellation(p_execution_id uuid)
 RETURNS agent_executions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select private.request_agent_execution_cancellation(p_execution_id); $function$;
CREATE OR REPLACE FUNCTION public.reconcile_stale_agent_execution(p_execution_id uuid)
 RETURNS agent_executions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select private.reconcile_stale_agent_execution(p_execution_id); $function$;
CREATE OR REPLACE FUNCTION public.retry_agent_execution(p_execution_id uuid, p_new_idempotency_key text)
 RETURNS agent_executions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.retry_agent_execution(p_execution_id, p_new_idempotency_key);
$function$;
CREATE OR REPLACE FUNCTION private.record_second_mission_conversion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owned_mission_count bigint;
begin
  if new.owner_id is null then return new; end if;
  select count(*) into owned_mission_count from public.missions as mission where mission.owner_id = new.owner_id;
  if owned_mission_count >= 2 then
    insert into public.product_growth_events (user_id, event_type)
    values (new.owner_id, 'second_mission_created') on conflict do nothing;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION private.agent_execution_approval_scope(p_workspace_id uuid, p_mission_id uuid, p_mission_version bigint, p_action_id uuid, p_action_version bigint, p_agent_id uuid, p_authority jsonb, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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
CREATE OR REPLACE FUNCTION private.agent_execution_payload_shape(p_value jsonb, p_depth integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
CREATE OR REPLACE FUNCTION private.agent_execution_has_meaningful_value(p_value jsonb, p_depth integer DEFAULT 0)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_type text;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return false;
  end if;

  v_type := jsonb_typeof(p_value);
  if v_type = 'string' then
    return nullif(btrim(p_value #>> '{}'), '') is not null;
  elsif v_type in ('number', 'boolean') then
    return true;
  elsif v_type in ('object', 'array') then
    if greatest(coalesce(p_depth, 0), 0) >= 8 then
      return false;
    end if;

    if v_type = 'object' then
      return exists (
        select 1
          from jsonb_each(p_value) as item(key, value)
         where private.agent_execution_has_meaningful_value(item.value, greatest(coalesce(p_depth, 0), 0) + 1)
      );
    end if;

    return exists (
      select 1
        from jsonb_array_elements(p_value) as item(value)
       where private.agent_execution_has_meaningful_value(item.value, greatest(coalesce(p_depth, 0), 0) + 1)
    );
  end if;

  return false;
end;
$function$;
CREATE OR REPLACE FUNCTION private.complete_read_only_research_execution(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text)
 RETURNS agent_executions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_execution public.agent_executions;
  v_initial public.agent_executions;
  v_agent public.workspace_agents;
  v_mission public.missions;
  v_now timestamptz;
  v_source_count integer;
  v_source jsonb;
  v_error_code text := nullif(btrim(coalesce(p_error_code, '')), '');
  v_error_message text := nullif(btrim(coalesce(p_error_message, '')), '');
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('SUCCEEDED', 'FAILED', 'UNKNOWN') then
    raise exception 'INVALID_RESEARCH_EXECUTION_STATUS' using errcode = '22023';
  end if;
  if p_result is null or jsonb_typeof(p_result) is distinct from 'object'
     or p_evidence is null or jsonb_typeof(p_evidence) is distinct from 'object' then
    raise exception 'INVALID_RESEARCH_EXECUTION_PAYLOAD' using errcode = '22023';
  end if;

  -- Lock in mission -> agent -> execution order to match the start boundary.
  select * into v_initial
    from public.agent_executions
   where id = p_execution_id;
  if not found
     or v_initial.requested_by <> auth.uid()
     or not private.can_edit_workspace(v_initial.workspace_id) then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_mission
    from public.missions
   where id = v_initial.mission_id
     and workspace_id = v_initial.workspace_id
   for update;
  if not found or v_mission.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'MISSION_CLOSED' using errcode = '22023';
  end if;

  select * into v_agent
    from public.workspace_agents
   where id = v_initial.agent_id
     and workspace_id = v_initial.workspace_id
   for share;
  if not found or v_agent.status <> 'ACTIVE' then
    raise exception 'RESEARCH_AGENT_AUTHORITY_CHANGED' using errcode = '42501';
  end if;

  if v_agent.authority ->> 'mode' is distinct from 'read_only'
     or v_agent.authority -> 'external_side_effects' is distinct from 'false'::jsonb then
    raise exception 'READ_ONLY_RESEARCH_EXECUTION_REQUIRED' using errcode = '42501';
  end if;

  if v_initial.authority_snapshot ->> 'mode' is distinct from 'read_only'
     or v_initial.authority_snapshot -> 'external_side_effects' is distinct from 'false'::jsonb then
    raise exception 'RESEARCH_AGENT_AUTHORITY_CHANGED' using errcode = '42501';
  end if;

  select * into v_execution
    from public.agent_executions
   where id = p_execution_id
   for update;
  if not found
     or v_execution.requested_by <> auth.uid()
     or v_execution.workspace_id <> v_initial.workspace_id
     or v_execution.mission_id <> v_initial.mission_id
     or v_execution.agent_id <> v_initial.agent_id then
    raise exception 'EXECUTION_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if v_execution.request ->> 'type' is distinct from 'read_only_research'
     or nullif(btrim(v_execution.request ->> 'request_id'), '') is null
     or v_execution.action_id is not null then
    raise exception 'READ_ONLY_RESEARCH_EXECUTION_REQUIRED' using errcode = '42501';
  end if;

  if p_evidence -> 'verified' is distinct from 'false'::jsonb
     or p_evidence ->> 'request_id' is distinct from v_execution.request ->> 'request_id'
     or p_evidence ->> 'outcome' is distinct from p_status then
    raise exception 'RESEARCH_RESULT_MUST_REMAIN_UNVERIFIED' using errcode = '22023';
  end if;

  if p_status = 'SUCCEEDED' then
    if nullif(btrim(p_result ->> 'summary'), '') is null
       or char_length(p_result ->> 'summary') > 12000
       or jsonb_typeof(p_result -> 'source_count') is distinct from 'number'
       or (p_result ->> 'source_count') !~ '^(0|[1-9][0-9]*)$'
       or jsonb_typeof(p_evidence -> 'sources') is distinct from 'array' then
      raise exception 'INVALID_RESEARCH_RESULT_SHAPE' using errcode = '22023';
    end if;

    v_source_count := (p_result ->> 'source_count')::integer;
    if v_source_count < 0 or v_source_count > 12
       or jsonb_array_length(p_evidence -> 'sources') <> v_source_count then
      raise exception 'INVALID_RESEARCH_SOURCE_COUNT' using errcode = '22023';
    end if;

    for v_source in
      select value from jsonb_array_elements(p_evidence -> 'sources') as source(value)
    loop
      if jsonb_typeof(v_source) is distinct from 'object'
         or jsonb_typeof(v_source -> 'url') is distinct from 'string'
         or (v_source ->> 'url') !~ '^https?://'
         or char_length(v_source ->> 'url') > 4096
         or nullif(btrim(v_source ->> 'title'), '') is null
         or char_length(v_source ->> 'title') > 500 then
        raise exception 'INVALID_RESEARCH_SOURCE' using errcode = '22023';
      end if;
    end loop;
  end if;

  if v_execution.status <> 'RUNNING' then
    if v_execution.status = p_status
       and v_execution.result is not distinct from p_result
       and v_execution.evidence is not distinct from p_evidence
       and v_execution.error_code is not distinct from v_error_code
       and v_execution.error_message is not distinct from v_error_message then
      return v_execution;
    end if;
    raise exception 'EXECUTION_ALREADY_FINALIZED' using errcode = '22023';
  end if;

  v_now := clock_timestamp();
  if v_execution.lease_expires_at <= v_now then
    raise exception 'EXECUTION_LEASE_EXPIRED_REQUIRES_RECONCILIATION' using errcode = '22023';
  end if;

  update public.agent_executions
     set status = p_status,
         result = p_result,
         evidence = p_evidence,
         error_code = v_error_code,
         error_message = v_error_message,
         completed_at = v_now
   where id = v_execution.id
   returning * into v_execution;

  perform public.record_mission_event(
    v_execution.mission_id,
    'AGENT_EXECUTION_COMPLETED',
    jsonb_build_object(
      'execution_id', v_execution.id,
      'agent_id', v_execution.agent_id,
      'status', v_execution.status,
      'verified', false,
      'read_only_research', true,
      'request_id', v_execution.request ->> 'request_id'
    )
  );

  return v_execution;
end;
$function$;
CREATE OR REPLACE FUNCTION public.complete_read_only_research_execution(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text)
 RETURNS agent_executions
 LANGUAGE sql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select private.complete_read_only_research_execution(
    p_execution_id, p_status, p_result, p_evidence, p_error_code, p_error_message
  );
$function$;
SET check_function_bodies = true;
ALTER TABLE "private"."anonymous_ai_ip_windows" ADD CONSTRAINT "anonymous_ai_ip_windows_pkey" PRIMARY KEY (ip_hash, window_start);
ALTER TABLE "private"."anonymous_ai_reservations" ADD CONSTRAINT "anonymous_ai_reservations_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."anonymous_ai_reservations" ADD CONSTRAINT "anonymous_ai_reservations_request_id_key" UNIQUE (request_id);
ALTER TABLE "private"."anonymous_ai_visitors" ADD CONSTRAINT "anonymous_ai_visitors_pkey" PRIMARY KEY (visitor_hash);
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_workspace_id_idempotency_key_key" UNIQUE (workspace_id, idempotency_key);
ALTER TABLE "public"."ai_entitlements" ADD CONSTRAINT "ai_entitlements_pkey" PRIMARY KEY (user_id);
ALTER TABLE "public"."ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_pkey" PRIMARY KEY (user_id, period_start);
ALTER TABLE "public"."ai_usage_reservations" ADD CONSTRAINT "ai_usage_reservations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."ai_usage_reservations" ADD CONSTRAINT "ai_usage_reservations_user_id_request_id_key" UNIQUE (user_id, request_id);
ALTER TABLE "public"."mission_actions" ADD CONSTRAINT "mission_actions_mission_position_key" UNIQUE (mission_id, "position");
ALTER TABLE "public"."mission_actions" ADD CONSTRAINT "mission_actions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."mission_approvals" ADD CONSTRAINT "mission_approvals_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."mission_events" ADD CONSTRAINT "mission_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."mission_outcomes" ADD CONSTRAINT "mission_outcomes_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."mission_verifications" ADD CONSTRAINT "mission_verifications_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."missions" ADD CONSTRAINT "missions_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."product_growth_events" ADD CONSTRAINT "product_growth_events_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workspace_activity" ADD CONSTRAINT "workspace_activity_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workspace_agents" ADD CONSTRAINT "workspace_agents_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_email_status_key" UNIQUE (workspace_id, email, status);
ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY (id);
ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_user_id_key" UNIQUE (workspace_id, user_id);
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY (id);
ALTER TABLE "private"."anonymous_ai_ip_windows" ADD CONSTRAINT "anonymous_ai_ip_windows_attempts_check" CHECK (attempts >= 0);
ALTER TABLE "private"."anonymous_ai_reservations" ADD CONSTRAINT "anonymous_ai_reservations_status_check" CHECK (status = ANY (ARRAY['reserved'::text, 'consumed'::text, 'released'::text]));
ALTER TABLE "private"."anonymous_ai_visitors" ADD CONSTRAINT "anonymous_ai_visitors_status_check" CHECK (status = ANY (ARRAY['available'::text, 'reserved'::text, 'consumed'::text]));
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_attempt_number_positive" CHECK (attempt_number > 0);
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_authority_snapshot_check" CHECK (jsonb_typeof(authority_snapshot) = 'object'::text);
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_request_check" CHECK (jsonb_typeof(request) = 'object'::text);
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_status_check" CHECK (status = ANY (ARRAY['RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'UNKNOWN'::text, 'BLOCKED'::text]));
ALTER TABLE "public"."ai_entitlements" ADD CONSTRAINT "ai_entitlements_monthly_limit_check" CHECK (plan = 'free'::text AND monthly_limit = 5 OR plan = 'plus'::text AND monthly_limit = 50 OR plan = 'pro'::text AND monthly_limit = 300);
ALTER TABLE "public"."ai_entitlements" ADD CONSTRAINT "ai_entitlements_plan_check" CHECK (plan = ANY (ARRAY['free'::text, 'plus'::text, 'pro'::text]));
ALTER TABLE "public"."ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_generations_used_check" CHECK (generations_used >= 0);
ALTER TABLE "public"."ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_monthly_limit_check" CHECK (plan = 'free'::text AND monthly_limit = 5 OR plan = 'plus'::text AND monthly_limit = 50 OR plan = 'pro'::text AND monthly_limit = 300);
ALTER TABLE "public"."ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_plan_check" CHECK (plan = ANY (ARRAY['free'::text, 'plus'::text, 'pro'::text]));
ALTER TABLE "public"."ai_usage_reservations" ADD CONSTRAINT "ai_usage_reservations_state_check" CHECK (state = ANY (ARRAY['reserved'::text, 'consumed'::text, 'released'::text]));
ALTER TABLE "public"."mission_actions" ADD CONSTRAINT "mission_actions_follow_up_requires_blocked" CHECK (follow_up_at IS NULL OR status = 'BLOCKED'::text) NOT VALID NOT VALID;
ALTER TABLE "public"."mission_actions" ADD CONSTRAINT "mission_actions_position_check" CHECK ("position" >= 0);
ALTER TABLE "public"."mission_actions" ADD CONSTRAINT "mission_actions_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'RUNNING'::text, 'COMPLETED'::text, 'BLOCKED'::text, 'CANCELLED'::text]));
ALTER TABLE "public"."mission_actions" ADD CONSTRAINT "mission_actions_title_check" CHECK (char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 2000);
ALTER TABLE "public"."mission_actions" ADD CONSTRAINT "mission_actions_version_minimum" CHECK (version >= 1);
ALTER TABLE "public"."mission_approvals" ADD CONSTRAINT "mission_approvals_decision_note_check" CHECK (decision_note IS NULL OR char_length(decision_note) <= 4000);
ALTER TABLE "public"."mission_approvals" ADD CONSTRAINT "mission_approvals_requested_scope_check" CHECK (jsonb_typeof(requested_scope) = 'object'::text);
ALTER TABLE "public"."mission_approvals" ADD CONSTRAINT "mission_approvals_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text]));
ALTER TABLE "public"."mission_events" ADD CONSTRAINT "mission_events_actor_type_check" CHECK (actor_type = ANY (ARRAY['USER'::text, 'SYSTEM'::text]));
ALTER TABLE "public"."mission_events" ADD CONSTRAINT "mission_events_event_type_check" CHECK (char_length(btrim(event_type)) >= 1 AND char_length(btrim(event_type)) <= 100);
ALTER TABLE "public"."mission_events" ADD CONSTRAINT "mission_events_payload_check" CHECK (jsonb_typeof(payload) = 'object'::text);
ALTER TABLE "public"."mission_outcomes" ADD CONSTRAINT "mission_outcomes_result_check" CHECK (jsonb_typeof(result) = 'object'::text);
ALTER TABLE "public"."mission_outcomes" ADD CONSTRAINT "mission_outcomes_status_check" CHECK (status = ANY (ARRAY['COMPLETED'::text, 'FAILED'::text]));
ALTER TABLE "public"."mission_outcomes" ADD CONSTRAINT "mission_outcomes_success_score_check" CHECK (success_score >= 0::numeric AND success_score <= 1::numeric);
ALTER TABLE "public"."mission_outcomes" ADD CONSTRAINT "mission_outcomes_verified_check" CHECK (verified = true);
ALTER TABLE "public"."mission_verifications" ADD CONSTRAINT "mission_verifications_confidence_check" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);
ALTER TABLE "public"."mission_verifications" ADD CONSTRAINT "mission_verifications_criteria_check" CHECK (jsonb_typeof(criteria) = 'object'::text);
ALTER TABLE "public"."mission_verifications" ADD CONSTRAINT "mission_verifications_evidence_check" CHECK (jsonb_typeof(evidence) = 'object'::text);
ALTER TABLE "public"."mission_verifications" ADD CONSTRAINT "mission_verifications_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'VERIFIED'::text, 'FAILED'::text]));
ALTER TABLE "public"."missions" ADD CONSTRAINT "missions_objective_check" CHECK (char_length(btrim(objective)) >= 1 AND char_length(btrim(objective)) <= 10000);
ALTER TABLE "public"."missions" ADD CONSTRAINT "missions_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'PLANNING'::text, 'READY'::text, 'RUNNING'::text, 'WAITING'::text, 'NEEDS_USER'::text, 'VERIFYING'::text, 'COMPLETED'::text, 'PAUSED'::text, 'BLOCKED'::text, 'FAILED'::text, 'CANCELLED'::text]));
ALTER TABLE "public"."missions" ADD CONSTRAINT "missions_version_minimum" CHECK (version >= 1);
ALTER TABLE "public"."product_growth_events" ADD CONSTRAINT "product_growth_events_event_shape_check" CHECK (event_type = 'template_shared'::text AND template_id IS NOT NULL AND template_id ~ '^[a-z0-9-]{1,80}$'::text OR event_type = 'second_mission_created'::text AND template_id IS NULL);
ALTER TABLE "public"."product_growth_events" ADD CONSTRAINT "product_growth_events_event_type_check" CHECK (event_type = ANY (ARRAY['template_shared'::text, 'second_mission_created'::text]));
ALTER TABLE "public"."workspace_agents" ADD CONSTRAINT "workspace_agents_authority_check" CHECK (jsonb_typeof(authority) = 'object'::text);
ALTER TABLE "public"."workspace_agents" ADD CONSTRAINT "workspace_agents_description_check" CHECK (char_length(description) <= 2000);
ALTER TABLE "public"."workspace_agents" ADD CONSTRAINT "workspace_agents_name_check" CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 120);
ALTER TABLE "public"."workspace_agents" ADD CONSTRAINT "workspace_agents_status_check" CHECK (status = ANY (ARRAY['ACTIVE'::text, 'PAUSED'::text]));
ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'member'::text, 'viewer'::text]));
ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REVOKED'::text, 'EXPIRED'::text]));
ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text]));
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_name_check" CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 200);
ALTER TABLE "private"."anonymous_ai_reservations" ADD CONSTRAINT "anonymous_ai_reservations_visitor_hash_fkey" FOREIGN KEY (visitor_hash) REFERENCES private.anonymous_ai_visitors(visitor_hash) ON DELETE CASCADE;
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_action_id_fkey" FOREIGN KEY (action_id) REFERENCES mission_actions(id) ON DELETE SET NULL;
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES workspace_agents(id) ON DELETE RESTRICT;
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_approval_id_fkey" FOREIGN KEY (approval_id) REFERENCES mission_approvals(id) ON DELETE SET NULL;
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_mission_id_fkey" FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE;
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id);
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_retry_of_fkey" FOREIGN KEY (retry_of_execution_id) REFERENCES agent_executions(id) ON DELETE SET NULL;
ALTER TABLE "public"."agent_executions" ADD CONSTRAINT "agent_executions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."ai_entitlements" ADD CONSTRAINT "ai_entitlements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."ai_usage_reservations" ADD CONSTRAINT "ai_usage_reservations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."mission_actions" ADD CONSTRAINT "mission_actions_mission_id_fkey" FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE;
ALTER TABLE "public"."mission_approvals" ADD CONSTRAINT "mission_approvals_action_id_fkey" FOREIGN KEY (action_id) REFERENCES mission_actions(id) ON DELETE SET NULL;
ALTER TABLE "public"."mission_approvals" ADD CONSTRAINT "mission_approvals_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id);
ALTER TABLE "public"."mission_approvals" ADD CONSTRAINT "mission_approvals_mission_id_fkey" FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE;
ALTER TABLE "public"."mission_approvals" ADD CONSTRAINT "mission_approvals_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id);
ALTER TABLE "public"."mission_approvals" ADD CONSTRAINT "mission_approvals_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."mission_events" ADD CONSTRAINT "mission_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."mission_events" ADD CONSTRAINT "mission_events_mission_id_fkey" FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE RESTRICT;
ALTER TABLE "public"."mission_events" ADD CONSTRAINT "mission_events_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."mission_outcomes" ADD CONSTRAINT "mission_outcomes_mission_id_fkey" FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE;
ALTER TABLE "public"."mission_outcomes" ADD CONSTRAINT "mission_outcomes_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."mission_outcomes" ADD CONSTRAINT "mission_outcomes_verification_id_fkey" FOREIGN KEY (verification_id) REFERENCES mission_verifications(id) ON DELETE RESTRICT;
ALTER TABLE "public"."mission_verifications" ADD CONSTRAINT "mission_verifications_mission_id_fkey" FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE;
ALTER TABLE "public"."mission_verifications" ADD CONSTRAINT "mission_verifications_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."missions" ADD CONSTRAINT "missions_agent_id_fkey" FOREIGN KEY (agent_id) REFERENCES workspace_agents(id) ON DELETE SET NULL;
ALTER TABLE "public"."missions" ADD CONSTRAINT "missions_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."missions" ADD CONSTRAINT "missions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."product_growth_events" ADD CONSTRAINT "product_growth_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."workspace_activity" ADD CONSTRAINT "workspace_activity_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE "public"."workspace_activity" ADD CONSTRAINT "workspace_activity_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."workspace_agents" ADD CONSTRAINT "workspace_agents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE "public"."workspace_agents" ADD CONSTRAINT "workspace_agents_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id);
ALTER TABLE "public"."workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "public"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE "public"."workspaces" ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX anonymous_ai_reservations_visitor_idx ON private.anonymous_ai_reservations USING btree (visitor_hash, created_at DESC);
CREATE INDEX agent_executions_action_id_idx ON public.agent_executions USING btree (action_id);
CREATE INDEX agent_executions_agent_idx ON public.agent_executions USING btree (agent_id, created_at DESC);
CREATE INDEX agent_executions_approval_id_idx ON public.agent_executions USING btree (approval_id);
CREATE INDEX agent_executions_mission_idx ON public.agent_executions USING btree (mission_id, created_at DESC);
CREATE INDEX agent_executions_requested_by_idx ON public.agent_executions USING btree (requested_by);
CREATE INDEX agent_executions_retry_of_idx ON public.agent_executions USING btree (retry_of_execution_id) WHERE (retry_of_execution_id IS NOT NULL);
CREATE INDEX agent_executions_workspace_status_lease_idx ON public.agent_executions USING btree (workspace_id, status, lease_expires_at);
CREATE INDEX ai_usage_reservations_expiry_idx ON public.ai_usage_reservations USING btree (user_id, period_start, state, expires_at);
CREATE INDEX mission_actions_follow_up_at_idx ON public.mission_actions USING btree (follow_up_at) WHERE (follow_up_at IS NOT NULL);
CREATE INDEX mission_actions_mission_id_idx ON public.mission_actions USING btree (mission_id);
CREATE INDEX mission_approvals_action_id_idx ON public.mission_approvals USING btree (action_id);
CREATE INDEX mission_approvals_agent_execution_scope_idx ON public.mission_approvals USING btree (mission_id, action_id, expires_at) WHERE ((status = 'APPROVED'::text) AND (expires_at IS NOT NULL));
CREATE INDEX mission_approvals_decided_by_idx ON public.mission_approvals USING btree (decided_by);
CREATE INDEX mission_approvals_mission_idx ON public.mission_approvals USING btree (mission_id, created_at DESC);
CREATE INDEX mission_approvals_requested_by_idx ON public.mission_approvals USING btree (requested_by);
CREATE INDEX mission_approvals_workspace_idx ON public.mission_approvals USING btree (workspace_id, status);
CREATE INDEX mission_events_actor_id_idx ON public.mission_events USING btree (actor_id);
CREATE INDEX mission_events_mission_created_idx ON public.mission_events USING btree (mission_id, created_at DESC);
CREATE INDEX mission_events_mission_id_idx ON public.mission_events USING btree (mission_id);
CREATE INDEX mission_events_owner_created_idx ON public.mission_events USING btree (owner_id, created_at DESC);
CREATE INDEX mission_outcomes_mission_created_idx ON public.mission_outcomes USING btree (mission_id, created_at DESC);
CREATE INDEX mission_outcomes_mission_id_idx ON public.mission_outcomes USING btree (mission_id);
CREATE INDEX mission_outcomes_owner_id_idx ON public.mission_outcomes USING btree (owner_id);
CREATE UNIQUE INDEX mission_outcomes_verification_uidx ON public.mission_outcomes USING btree (verification_id);
CREATE INDEX mission_verifications_mission_created_idx ON public.mission_verifications USING btree (mission_id, created_at DESC);
CREATE INDEX mission_verifications_mission_id_idx ON public.mission_verifications USING btree (mission_id);
CREATE INDEX mission_verifications_owner_id_idx ON public.mission_verifications USING btree (owner_id);
CREATE INDEX missions_agent_idx ON public.missions USING btree (agent_id);
CREATE INDEX missions_owner_id_idx ON public.missions USING btree (owner_id);
CREATE INDEX missions_workspace_id_idx ON public.missions USING btree (workspace_id);
CREATE UNIQUE INDEX product_growth_second_mission_once_idx ON public.product_growth_events USING btree (user_id) WHERE (event_type = 'second_mission_created'::text);
CREATE UNIQUE INDEX product_growth_template_shared_once_idx ON public.product_growth_events USING btree (user_id, template_id) WHERE (event_type = 'template_shared'::text);
CREATE INDEX workspace_activity_actor_user_id_idx ON public.workspace_activity USING btree (actor_user_id);
CREATE INDEX workspace_activity_workspace_created_idx ON public.workspace_activity USING btree (workspace_id, created_at DESC);
CREATE INDEX workspace_agents_created_by_idx ON public.workspace_agents USING btree (created_by);
CREATE INDEX workspace_agents_workspace_idx ON public.workspace_agents USING btree (workspace_id);
CREATE INDEX workspace_invitations_invited_by_idx ON public.workspace_invitations USING btree (invited_by);
CREATE INDEX workspace_invitations_workspace_idx ON public.workspace_invitations USING btree (workspace_id, created_at DESC);
CREATE INDEX workspace_members_user_idx ON public.workspace_members USING btree (user_id);
CREATE INDEX workspace_members_workspace_idx ON public.workspace_members USING btree (workspace_id);
CREATE INDEX workspaces_owner_id_idx ON public.workspaces USING btree (owner_id);
ALTER TABLE "public"."agent_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_usage_monthly" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_usage_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."mission_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."mission_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."mission_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."mission_outcomes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."mission_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."missions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."product_growth_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_executions_member_select" ON "public"."agent_executions" AS PERMISSIVE FOR SELECT TO PUBLIC USING (private.is_workspace_member(workspace_id));
CREATE POLICY "deny_direct_access" ON "public"."ai_entitlements" AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_access" ON "public"."ai_usage_monthly" AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "deny_direct_access" ON "public"."ai_usage_reservations" AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);
CREATE POLICY "mission_actions_delete_admin" ON "public"."mission_actions" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM missions m
  WHERE ((m.id = mission_actions.mission_id) AND (private.workspace_role(m.workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "mission_actions_insert_editor" ON "public"."mission_actions" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM missions m
  WHERE ((m.id = mission_actions.mission_id) AND private.can_edit_workspace(m.workspace_id)))));
CREATE POLICY "mission_actions_select_member" ON "public"."mission_actions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM missions m
  WHERE ((m.id = mission_actions.mission_id) AND private.is_workspace_member(m.workspace_id)))));
CREATE POLICY "mission_actions_update_editor" ON "public"."mission_actions" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM missions m
  WHERE ((m.id = mission_actions.mission_id) AND private.can_edit_workspace(m.workspace_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM missions m
  WHERE ((m.id = mission_actions.mission_id) AND private.can_edit_workspace(m.workspace_id)))));
CREATE POLICY "mission_approvals_approver_update" ON "public"."mission_approvals" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((private.workspace_role(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((private.workspace_role(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY "mission_approvals_member_insert" ON "public"."mission_approvals" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((private.is_workspace_member(workspace_id) AND (requested_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "mission_approvals_member_select" ON "public"."mission_approvals" AS PERMISSIVE FOR SELECT TO PUBLIC USING (private.is_workspace_member(workspace_id));
CREATE POLICY "mission_events_select_member" ON "public"."mission_events" AS PERMISSIVE FOR SELECT TO PUBLIC USING (private.is_workspace_member(( SELECT m.workspace_id
   FROM missions m
  WHERE (m.id = mission_events.mission_id))));
CREATE POLICY "mission_outcomes_select_member" ON "public"."mission_outcomes" AS PERMISSIVE FOR SELECT TO PUBLIC USING (private.is_workspace_member(( SELECT m.workspace_id
   FROM missions m
  WHERE (m.id = mission_outcomes.mission_id))));
CREATE POLICY "mission_verifications_select_member" ON "public"."mission_verifications" AS PERMISSIVE FOR SELECT TO PUBLIC USING (private.is_workspace_member(( SELECT m.workspace_id
   FROM missions m
  WHERE (m.id = mission_verifications.mission_id))));
CREATE POLICY "missions_delete_admin" ON "public"."missions" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((private.workspace_role(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY "missions_initial_state" ON "public"."missions" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (((status = 'DRAFT'::text) AND (version = 1)));
CREATE POLICY "missions_insert_member" ON "public"."missions" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) AND private.can_edit_workspace(workspace_id)));
CREATE POLICY "missions_select_member" ON "public"."missions" AS PERMISSIVE FOR SELECT TO PUBLIC USING (private.is_workspace_member(workspace_id));
CREATE POLICY "missions_update_editor" ON "public"."missions" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (private.can_edit_workspace(workspace_id)) WITH CHECK (private.can_edit_workspace(workspace_id));
CREATE POLICY "product_growth_events_insert_template_share" ON "public"."product_growth_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (event_type = 'template_shared'::text) AND (template_id IS NOT NULL)));
CREATE POLICY "product_growth_events_select_own" ON "public"."product_growth_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "profiles_select_own" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "profiles_update_own" ON "public"."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "workspace_activity_member_select" ON "public"."workspace_activity" AS PERMISSIVE FOR SELECT TO PUBLIC USING (private.is_workspace_member(workspace_id));
CREATE POLICY "workspace_agents_admin_delete" ON "public"."workspace_agents" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((private.workspace_role(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY "workspace_agents_admin_insert" ON "public"."workspace_agents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((private.workspace_role(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY "workspace_agents_admin_update" ON "public"."workspace_agents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((private.workspace_role(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((private.workspace_role(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY "workspace_agents_member_select" ON "public"."workspace_agents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.is_workspace_member(workspace_id));
CREATE POLICY "workspace_invitations_member_select" ON "public"."workspace_invitations" AS PERMISSIVE FOR SELECT TO PUBLIC USING (private.is_workspace_member(workspace_id));
CREATE POLICY "workspace_invitations_owner_insert" ON "public"."workspace_invitations" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((private.workspace_role(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text])) AND (invited_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "workspace_invitations_owner_update" ON "public"."workspace_invitations" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((private.workspace_role(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((private.workspace_role(workspace_id) = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE POLICY "workspace_members_owner_delete" ON "public"."workspace_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "workspace_members_owner_insert" ON "public"."workspace_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "workspace_members_owner_update" ON "public"."workspace_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "workspace_members_select_member" ON "public"."workspace_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((private.is_workspace_member(workspace_id) OR (EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_members.workspace_id) AND (w.owner_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "workspaces_delete_owner" ON "public"."workspaces" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "workspaces_insert_own" ON "public"."workspaces" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "workspaces_select_member" ON "public"."workspaces" AS PERMISSIVE FOR SELECT TO PUBLIC USING (private.is_workspace_member(id));
CREATE POLICY "workspaces_update_admin" ON "public"."workspaces" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((private.workspace_role(id) = ANY (ARRAY['owner'::text, 'admin'::text]))) WITH CHECK ((private.workspace_role(id) = ANY (ARRAY['owner'::text, 'admin'::text])));
CREATE TRIGGER mission_actions_completion_insert_guard BEFORE INSERT ON mission_actions FOR EACH ROW EXECUTE FUNCTION guard_mission_action_insert();
CREATE TRIGGER mission_actions_delete_history_guard BEFORE DELETE ON mission_actions FOR EACH ROW EXECUTE FUNCTION prevent_mission_action_delete_with_history();
CREATE TRIGGER mission_actions_parent_immutable BEFORE UPDATE ON mission_actions FOR EACH ROW EXECUTE FUNCTION prevent_mission_action_reparent();
CREATE TRIGGER mission_actions_set_updated_at BEFORE UPDATE ON mission_actions FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER mission_events_append_only BEFORE DELETE OR UPDATE ON mission_events FOR EACH ROW EXECUTE FUNCTION private.block_mission_history_mutation();
CREATE TRIGGER mission_outcomes_append_only BEFORE DELETE OR UPDATE ON mission_outcomes FOR EACH ROW EXECUTE FUNCTION private.block_mission_history_mutation();
CREATE TRIGGER mission_verifications_append_only BEFORE DELETE OR UPDATE ON mission_verifications FOR EACH ROW EXECUTE FUNCTION private.block_mission_history_mutation();
CREATE TRIGGER missions_record_second_mission_conversion AFTER INSERT ON missions FOR EACH ROW EXECUTE FUNCTION private.record_second_mission_conversion();
CREATE TRIGGER missions_set_updated_at BEFORE UPDATE ON missions FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER workspaces_set_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
REVOKE ALL ON TABLE "private"."anonymous_ai_ip_windows" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE "private"."anonymous_ai_reservations" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE "private"."anonymous_ai_visitors" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE "public"."agent_executions" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."agent_executions" TO "service_role";
GRANT SELECT ON TABLE "public"."agent_executions" TO "service_role";
GRANT UPDATE ON TABLE "public"."agent_executions" TO "service_role";
GRANT DELETE ON TABLE "public"."agent_executions" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."agent_executions" TO "service_role";
GRANT REFERENCES ON TABLE "public"."agent_executions" TO "service_role";
GRANT TRIGGER ON TABLE "public"."agent_executions" TO "service_role";
GRANT SELECT ON TABLE "public"."agent_executions" TO "authenticated";
REVOKE ALL ON TABLE "public"."ai_entitlements" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."ai_entitlements" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_entitlements" TO "service_role";
GRANT UPDATE ON TABLE "public"."ai_entitlements" TO "service_role";
GRANT DELETE ON TABLE "public"."ai_entitlements" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."ai_entitlements" TO "service_role";
GRANT REFERENCES ON TABLE "public"."ai_entitlements" TO "service_role";
GRANT TRIGGER ON TABLE "public"."ai_entitlements" TO "service_role";
REVOKE ALL ON TABLE "public"."ai_usage_monthly" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."ai_usage_monthly" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_usage_monthly" TO "service_role";
GRANT UPDATE ON TABLE "public"."ai_usage_monthly" TO "service_role";
GRANT DELETE ON TABLE "public"."ai_usage_monthly" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."ai_usage_monthly" TO "service_role";
GRANT REFERENCES ON TABLE "public"."ai_usage_monthly" TO "service_role";
GRANT TRIGGER ON TABLE "public"."ai_usage_monthly" TO "service_role";
REVOKE ALL ON TABLE "public"."ai_usage_reservations" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."ai_usage_reservations" TO "service_role";
GRANT SELECT ON TABLE "public"."ai_usage_reservations" TO "service_role";
GRANT UPDATE ON TABLE "public"."ai_usage_reservations" TO "service_role";
GRANT DELETE ON TABLE "public"."ai_usage_reservations" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."ai_usage_reservations" TO "service_role";
GRANT REFERENCES ON TABLE "public"."ai_usage_reservations" TO "service_role";
GRANT TRIGGER ON TABLE "public"."ai_usage_reservations" TO "service_role";
REVOKE ALL ON TABLE "public"."mission_actions" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."mission_actions" TO "service_role";
GRANT SELECT ON TABLE "public"."mission_actions" TO "service_role";
GRANT UPDATE ON TABLE "public"."mission_actions" TO "service_role";
GRANT DELETE ON TABLE "public"."mission_actions" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."mission_actions" TO "service_role";
GRANT REFERENCES ON TABLE "public"."mission_actions" TO "service_role";
GRANT TRIGGER ON TABLE "public"."mission_actions" TO "service_role";
GRANT INSERT ON TABLE "public"."mission_actions" TO "authenticated";
GRANT SELECT ON TABLE "public"."mission_actions" TO "authenticated";
GRANT DELETE ON TABLE "public"."mission_actions" TO "authenticated";
REVOKE ALL ON TABLE "public"."mission_approvals" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."mission_approvals" TO "authenticated";
GRANT SELECT ON TABLE "public"."mission_approvals" TO "authenticated";
GRANT UPDATE ON TABLE "public"."mission_approvals" TO "authenticated";
GRANT DELETE ON TABLE "public"."mission_approvals" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."mission_approvals" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."mission_approvals" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."mission_approvals" TO "authenticated";
GRANT INSERT ON TABLE "public"."mission_approvals" TO "service_role";
GRANT SELECT ON TABLE "public"."mission_approvals" TO "service_role";
GRANT UPDATE ON TABLE "public"."mission_approvals" TO "service_role";
GRANT DELETE ON TABLE "public"."mission_approvals" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."mission_approvals" TO "service_role";
GRANT REFERENCES ON TABLE "public"."mission_approvals" TO "service_role";
GRANT TRIGGER ON TABLE "public"."mission_approvals" TO "service_role";
REVOKE ALL ON TABLE "public"."mission_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."mission_events" TO "service_role";
GRANT SELECT ON TABLE "public"."mission_events" TO "service_role";
GRANT UPDATE ON TABLE "public"."mission_events" TO "service_role";
GRANT DELETE ON TABLE "public"."mission_events" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."mission_events" TO "service_role";
GRANT REFERENCES ON TABLE "public"."mission_events" TO "service_role";
GRANT TRIGGER ON TABLE "public"."mission_events" TO "service_role";
GRANT SELECT ON TABLE "public"."mission_events" TO "authenticated";
REVOKE ALL ON TABLE "public"."mission_outcomes" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."mission_outcomes" TO "service_role";
GRANT SELECT ON TABLE "public"."mission_outcomes" TO "service_role";
GRANT UPDATE ON TABLE "public"."mission_outcomes" TO "service_role";
GRANT DELETE ON TABLE "public"."mission_outcomes" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."mission_outcomes" TO "service_role";
GRANT REFERENCES ON TABLE "public"."mission_outcomes" TO "service_role";
GRANT TRIGGER ON TABLE "public"."mission_outcomes" TO "service_role";
GRANT SELECT ON TABLE "public"."mission_outcomes" TO "authenticated";
REVOKE ALL ON TABLE "public"."mission_verifications" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."mission_verifications" TO "service_role";
GRANT SELECT ON TABLE "public"."mission_verifications" TO "service_role";
GRANT UPDATE ON TABLE "public"."mission_verifications" TO "service_role";
GRANT DELETE ON TABLE "public"."mission_verifications" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."mission_verifications" TO "service_role";
GRANT REFERENCES ON TABLE "public"."mission_verifications" TO "service_role";
GRANT TRIGGER ON TABLE "public"."mission_verifications" TO "service_role";
GRANT SELECT ON TABLE "public"."mission_verifications" TO "authenticated";
REVOKE ALL ON TABLE "public"."missions" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."missions" TO "service_role";
GRANT SELECT ON TABLE "public"."missions" TO "service_role";
GRANT UPDATE ON TABLE "public"."missions" TO "service_role";
GRANT DELETE ON TABLE "public"."missions" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."missions" TO "service_role";
GRANT REFERENCES ON TABLE "public"."missions" TO "service_role";
GRANT TRIGGER ON TABLE "public"."missions" TO "service_role";
GRANT INSERT ON TABLE "public"."missions" TO "authenticated";
GRANT SELECT ON TABLE "public"."missions" TO "authenticated";
GRANT DELETE ON TABLE "public"."missions" TO "authenticated";
REVOKE ALL ON TABLE "public"."product_growth_events" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."product_growth_events" TO "authenticated";
GRANT SELECT ON TABLE "public"."product_growth_events" TO "authenticated";
GRANT UPDATE ON TABLE "public"."product_growth_events" TO "authenticated";
GRANT DELETE ON TABLE "public"."product_growth_events" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."product_growth_events" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."product_growth_events" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."product_growth_events" TO "authenticated";
GRANT INSERT ON TABLE "public"."product_growth_events" TO "service_role";
GRANT SELECT ON TABLE "public"."product_growth_events" TO "service_role";
GRANT UPDATE ON TABLE "public"."product_growth_events" TO "service_role";
GRANT DELETE ON TABLE "public"."product_growth_events" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."product_growth_events" TO "service_role";
GRANT REFERENCES ON TABLE "public"."product_growth_events" TO "service_role";
GRANT TRIGGER ON TABLE "public"."product_growth_events" TO "service_role";
REVOKE ALL ON TABLE "public"."profiles" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "service_role";
GRANT UPDATE ON TABLE "public"."profiles" TO "service_role";
GRANT DELETE ON TABLE "public"."profiles" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."profiles" TO "service_role";
GRANT REFERENCES ON TABLE "public"."profiles" TO "service_role";
GRANT TRIGGER ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE ON TABLE "public"."profiles" TO "authenticated";
REVOKE ALL ON TABLE "public"."workspace_activity" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."workspace_activity" TO "service_role";
GRANT SELECT ON TABLE "public"."workspace_activity" TO "service_role";
GRANT UPDATE ON TABLE "public"."workspace_activity" TO "service_role";
GRANT DELETE ON TABLE "public"."workspace_activity" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."workspace_activity" TO "service_role";
GRANT REFERENCES ON TABLE "public"."workspace_activity" TO "service_role";
GRANT TRIGGER ON TABLE "public"."workspace_activity" TO "service_role";
REVOKE ALL ON TABLE "public"."workspace_agents" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."workspace_agents" TO "authenticated";
GRANT SELECT ON TABLE "public"."workspace_agents" TO "authenticated";
GRANT UPDATE ON TABLE "public"."workspace_agents" TO "authenticated";
GRANT DELETE ON TABLE "public"."workspace_agents" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."workspace_agents" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."workspace_agents" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."workspace_agents" TO "authenticated";
GRANT INSERT ON TABLE "public"."workspace_agents" TO "service_role";
GRANT SELECT ON TABLE "public"."workspace_agents" TO "service_role";
GRANT UPDATE ON TABLE "public"."workspace_agents" TO "service_role";
GRANT DELETE ON TABLE "public"."workspace_agents" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."workspace_agents" TO "service_role";
GRANT REFERENCES ON TABLE "public"."workspace_agents" TO "service_role";
GRANT TRIGGER ON TABLE "public"."workspace_agents" TO "service_role";
REVOKE ALL ON TABLE "public"."workspace_invitations" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT SELECT ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT UPDATE ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT DELETE ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT INSERT ON TABLE "public"."workspace_invitations" TO "service_role";
GRANT SELECT ON TABLE "public"."workspace_invitations" TO "service_role";
GRANT UPDATE ON TABLE "public"."workspace_invitations" TO "service_role";
GRANT DELETE ON TABLE "public"."workspace_invitations" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."workspace_invitations" TO "service_role";
GRANT REFERENCES ON TABLE "public"."workspace_invitations" TO "service_role";
GRANT TRIGGER ON TABLE "public"."workspace_invitations" TO "service_role";
REVOKE ALL ON TABLE "public"."workspace_members" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."workspace_members" TO "authenticated";
GRANT SELECT ON TABLE "public"."workspace_members" TO "authenticated";
GRANT UPDATE ON TABLE "public"."workspace_members" TO "authenticated";
GRANT DELETE ON TABLE "public"."workspace_members" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."workspace_members" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."workspace_members" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."workspace_members" TO "authenticated";
GRANT INSERT ON TABLE "public"."workspace_members" TO "service_role";
GRANT SELECT ON TABLE "public"."workspace_members" TO "service_role";
GRANT UPDATE ON TABLE "public"."workspace_members" TO "service_role";
GRANT DELETE ON TABLE "public"."workspace_members" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."workspace_members" TO "service_role";
GRANT REFERENCES ON TABLE "public"."workspace_members" TO "service_role";
GRANT TRIGGER ON TABLE "public"."workspace_members" TO "service_role";
REVOKE ALL ON TABLE "public"."workspaces" FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON TABLE "public"."workspaces" TO "service_role";
GRANT SELECT ON TABLE "public"."workspaces" TO "service_role";
GRANT UPDATE ON TABLE "public"."workspaces" TO "service_role";
GRANT DELETE ON TABLE "public"."workspaces" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."workspaces" TO "service_role";
GRANT REFERENCES ON TABLE "public"."workspaces" TO "service_role";
GRANT TRIGGER ON TABLE "public"."workspaces" TO "service_role";
GRANT INSERT ON TABLE "public"."workspaces" TO "authenticated";
GRANT SELECT ON TABLE "public"."workspaces" TO "authenticated";
GRANT UPDATE ON TABLE "public"."workspaces" TO "authenticated";
GRANT DELETE ON TABLE "public"."workspaces" TO "authenticated";
REVOKE ALL ON FUNCTION "private"."set_updated_at"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."set_updated_at"() TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."handle_new_user_profile"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."handle_new_user_profile"() TO "service_role";
REVOKE ALL ON FUNCTION "private"."handle_new_user_profile"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "private"."create_mission_verification"(p_mission_id uuid, p_status text, p_criteria jsonb, p_evidence jsonb, p_confidence numeric, p_failure_reason text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."create_mission_verification"(p_mission_id uuid, p_status text, p_criteria jsonb, p_evidence jsonb, p_confidence numeric, p_failure_reason text) TO "service_role";
GRANT EXECUTE ON FUNCTION "private"."create_mission_verification"(p_mission_id uuid, p_status text, p_criteria jsonb, p_evidence jsonb, p_confidence numeric, p_failure_reason text) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."commit_verified_mission_outcome"(p_mission_id uuid, p_verification_id uuid, p_result jsonb, p_success_score numeric, p_status text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."commit_verified_mission_outcome"(p_mission_id uuid, p_verification_id uuid, p_result jsonb, p_success_score numeric, p_status text) TO "service_role";
GRANT EXECUTE ON FUNCTION "private"."commit_verified_mission_outcome"(p_mission_id uuid, p_verification_id uuid, p_result jsonb, p_success_score numeric, p_status text) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."block_mission_history_mutation"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "private"."transition_mission"(p_mission_id uuid, p_to_status text, p_expected_version bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."transition_mission"(p_mission_id uuid, p_to_status text, p_expected_version bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."transition_mission"(p_mission_id uuid, p_to_status text, p_expected_version bigint) TO "service_role";
REVOKE ALL ON FUNCTION "private"."update_mission_details"(p_mission_id uuid, p_objective text, p_expected_version bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."update_mission_details"(p_mission_id uuid, p_objective text, p_expected_version bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."update_mission_details"(p_mission_id uuid, p_objective text, p_expected_version bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."prevent_mission_action_reparent"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."prevent_mission_action_reparent"() TO "service_role";
REVOKE ALL ON FUNCTION "private"."record_mission_event"(p_mission_id uuid, p_event_type text, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."record_mission_event"(p_mission_id uuid, p_event_type text, p_payload jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION "private"."record_mission_event"(p_mission_id uuid, p_event_type text, p_payload jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."prevent_mission_action_delete_with_history"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."prevent_mission_action_delete_with_history"() TO "service_role";
REVOKE ALL ON FUNCTION "private"."transition_mission_action"(p_action_id uuid, p_to_status text, p_expected_version bigint, p_follow_up_at timestamp with time zone, p_set_follow_up boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."transition_mission_action"(p_action_id uuid, p_to_status text, p_expected_version bigint, p_follow_up_at timestamp with time zone, p_set_follow_up boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."transition_mission_action"(p_action_id uuid, p_to_status text, p_expected_version bigint, p_follow_up_at timestamp with time zone, p_set_follow_up boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."guard_mission_action_insert"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."guard_mission_action_insert"() TO "service_role";
REVOKE ALL ON FUNCTION "private"."get_ai_usage"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."get_ai_usage"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."get_ai_usage"() TO "service_role";
REVOKE ALL ON FUNCTION "private"."reserve_ai_generation"(p_request_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."reserve_ai_generation"(p_request_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."reserve_ai_generation"(p_request_id text) TO "service_role";
REVOKE ALL ON FUNCTION "private"."consume_ai_generation"(p_reservation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."consume_ai_generation"(p_reservation_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."consume_ai_generation"(p_reservation_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "private"."release_ai_generation"(p_reservation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."release_ai_generation"(p_reservation_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."release_ai_generation"(p_reservation_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "private"."create_mission_with_actions"(p_workspace_id uuid, p_objective text, p_actions jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."create_mission_with_actions"(p_workspace_id uuid, p_objective text, p_actions jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."create_mission_with_actions"(p_workspace_id uuid, p_objective text, p_actions jsonb) TO "service_role";
REVOKE ALL ON FUNCTION "public"."commit_verified_mission_outcome"(p_mission_id uuid, p_verification_id uuid, p_result jsonb, p_success_score numeric, p_status text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."commit_verified_mission_outcome"(p_mission_id uuid, p_verification_id uuid, p_result jsonb, p_success_score numeric, p_status text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."commit_verified_mission_outcome"(p_mission_id uuid, p_verification_id uuid, p_result jsonb, p_success_score numeric, p_status text) TO "service_role";
REVOKE ALL ON FUNCTION "public"."consume_ai_generation"(p_reservation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."consume_ai_generation"(p_reservation_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."consume_ai_generation"(p_reservation_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_mission_verification"(p_mission_id uuid, p_status text, p_criteria jsonb, p_evidence jsonb, p_confidence numeric, p_failure_reason text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."create_mission_verification"(p_mission_id uuid, p_status text, p_criteria jsonb, p_evidence jsonb, p_confidence numeric, p_failure_reason text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_mission_verification"(p_mission_id uuid, p_status text, p_criteria jsonb, p_evidence jsonb, p_confidence numeric, p_failure_reason text) TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_mission_with_actions"(p_workspace_id uuid, p_objective text, p_actions jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."create_mission_with_actions"(p_workspace_id uuid, p_objective text, p_actions jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_mission_with_actions"(p_workspace_id uuid, p_objective text, p_actions jsonb) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_ai_usage"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."get_ai_usage"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_ai_usage"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."release_ai_generation"(p_reservation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."release_ai_generation"(p_reservation_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."release_ai_generation"(p_reservation_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "public"."reserve_ai_generation"(p_request_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."reserve_ai_generation"(p_request_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reserve_ai_generation"(p_request_id text) TO "service_role";
REVOKE ALL ON FUNCTION "public"."transition_mission"(p_mission_id uuid, p_to_status text, p_expected_version bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."transition_mission"(p_mission_id uuid, p_to_status text, p_expected_version bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."transition_mission"(p_mission_id uuid, p_to_status text, p_expected_version bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."transition_mission_action"(p_action_id uuid, p_to_status text, p_expected_version bigint, p_follow_up_at timestamp with time zone, p_set_follow_up boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."transition_mission_action"(p_action_id uuid, p_to_status text, p_expected_version bigint, p_follow_up_at timestamp with time zone, p_set_follow_up boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."transition_mission_action"(p_action_id uuid, p_to_status text, p_expected_version bigint, p_follow_up_at timestamp with time zone, p_set_follow_up boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_mission_details"(p_mission_id uuid, p_objective text, p_expected_version bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."update_mission_details"(p_mission_id uuid, p_objective text, p_expected_version bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_mission_details"(p_mission_id uuid, p_objective text, p_expected_version bigint) TO "service_role";
REVOKE ALL ON FUNCTION "private"."reserve_anonymous_ai_generation"(p_visitor_hash text, p_ip_hash text, p_request_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "private"."consume_anonymous_ai_generation"(p_reservation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "private"."release_anonymous_ai_generation"(p_reservation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "public"."reserve_anonymous_ai_generation"(p_visitor_hash text, p_ip_hash text, p_request_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."reserve_anonymous_ai_generation"(p_visitor_hash text, p_ip_hash text, p_request_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "public"."consume_anonymous_ai_generation"(p_reservation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."consume_anonymous_ai_generation"(p_reservation_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "public"."release_anonymous_ai_generation"(p_reservation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."release_anonymous_ai_generation"(p_reservation_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "public"."record_mission_event"(p_mission_id uuid, p_event_type text, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."record_mission_event"(p_mission_id uuid, p_event_type text, p_payload jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."record_mission_event"(p_mission_id uuid, p_event_type text, p_payload jsonb) TO "service_role";
REVOKE ALL ON FUNCTION "private"."is_workspace_member"(p_workspace_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."is_workspace_member"(p_workspace_id uuid, p_user_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."workspace_role"(p_workspace_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."workspace_role"(p_workspace_id uuid, p_user_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."can_edit_workspace"(p_workspace_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."can_edit_workspace"(p_workspace_id uuid, p_user_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."request_mission_approval"(p_mission_id uuid, p_action_id uuid, p_scope jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."request_mission_approval"(p_mission_id uuid, p_action_id uuid, p_scope jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."decide_mission_approval"(p_approval_id uuid, p_decision text, p_note text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."decide_mission_approval"(p_approval_id uuid, p_decision text, p_note text) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."request_mission_approval"(p_mission_id uuid, p_action_id uuid, p_scope jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."request_mission_approval"(p_mission_id uuid, p_action_id uuid, p_scope jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."request_mission_approval"(p_mission_id uuid, p_action_id uuid, p_scope jsonb) TO "service_role";
REVOKE ALL ON FUNCTION "public"."decide_mission_approval"(p_approval_id uuid, p_decision text, p_note text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."decide_mission_approval"(p_approval_id uuid, p_decision text, p_note text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."decide_mission_approval"(p_approval_id uuid, p_decision text, p_note text) TO "service_role";
REVOKE ALL ON FUNCTION "private"."start_agent_execution"(p_mission_id uuid, p_action_id uuid, p_agent_id uuid, p_idempotency_key text, p_request jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."start_agent_execution"(p_mission_id uuid, p_action_id uuid, p_agent_id uuid, p_idempotency_key text, p_request jsonb) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."complete_agent_execution"(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text, p_error_message text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."complete_agent_execution"(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text, p_error_message text) TO "service_role";
REVOKE ALL ON FUNCTION "public"."start_agent_execution"(p_mission_id uuid, p_action_id uuid, p_agent_id uuid, p_idempotency_key text, p_request jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."start_agent_execution"(p_mission_id uuid, p_action_id uuid, p_agent_id uuid, p_idempotency_key text, p_request jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."start_agent_execution"(p_mission_id uuid, p_action_id uuid, p_agent_id uuid, p_idempotency_key text, p_request jsonb) TO "service_role";
REVOKE ALL ON FUNCTION "public"."complete_agent_execution"(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text, p_error_message text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."complete_agent_execution"(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text, p_error_message text) TO "service_role";
REVOKE ALL ON FUNCTION "private"."create_workspace_invitation"(p_workspace_id uuid, p_email text, p_role text, p_token_hash text, p_expires_at timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."create_workspace_invitation"(p_workspace_id uuid, p_email text, p_role text, p_token_hash text, p_expires_at timestamp with time zone) TO PUBLIC;
REVOKE ALL ON FUNCTION "public"."create_workspace_invitation"(p_workspace_id uuid, p_email text, p_role text, p_token_hash text, p_expires_at timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."create_workspace_invitation"(p_workspace_id uuid, p_email text, p_role text, p_token_hash text, p_expires_at timestamp with time zone) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_workspace_invitation"(p_workspace_id uuid, p_email text, p_role text, p_token_hash text, p_expires_at timestamp with time zone) TO "service_role";
REVOKE ALL ON FUNCTION "private"."get_workspace_invitation"(p_token_hash text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "public"."get_workspace_invitation"(p_token_hash text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."get_workspace_invitation"(p_token_hash text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_workspace_invitation"(p_token_hash text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_workspace_invitation"(p_token_hash text) TO "service_role";
REVOKE ALL ON FUNCTION "private"."accept_workspace_invitation"(p_token_hash text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "public"."accept_workspace_invitation"(p_token_hash text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."accept_workspace_invitation"(p_token_hash text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."accept_workspace_invitation"(p_token_hash text) TO "service_role";
REVOKE ALL ON FUNCTION "private"."revoke_workspace_invitation"(p_invitation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "public"."revoke_workspace_invitation"(p_invitation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."revoke_workspace_invitation"(p_invitation_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."revoke_workspace_invitation"(p_invitation_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "private"."list_workspace_members"(p_workspace_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."list_workspace_members"(p_workspace_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."list_workspace_members"(p_workspace_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."list_workspace_members"(p_workspace_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_workspace_members"(p_workspace_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "private"."update_workspace_member_role"(p_member_id uuid, p_role text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."update_workspace_member_role"(p_member_id uuid, p_role text) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."update_workspace_member_role"(p_member_id uuid, p_role text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."update_workspace_member_role"(p_member_id uuid, p_role text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_workspace_member_role"(p_member_id uuid, p_role text) TO "service_role";
REVOKE ALL ON FUNCTION "private"."remove_workspace_member"(p_member_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."remove_workspace_member"(p_member_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."remove_workspace_member"(p_member_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."remove_workspace_member"(p_member_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."remove_workspace_member"(p_member_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "private"."record_workspace_activity"(p_workspace_id uuid, p_event_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "public"."list_workspace_activity"(p_workspace_id uuid, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."list_workspace_activity"(p_workspace_id uuid, p_limit integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_workspace_activity"(p_workspace_id uuid, p_limit integer) TO "service_role";
REVOKE ALL ON FUNCTION "private"."list_workspace_activity"(p_workspace_id uuid, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "private"."ensure_owned_workspace"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."ensure_owned_workspace"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."ensure_owned_workspace"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."ensure_owned_workspace"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."ensure_owned_workspace"() TO "service_role";
REVOKE ALL ON FUNCTION "private"."heartbeat_agent_execution"(p_execution_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."heartbeat_agent_execution"(p_execution_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."request_agent_execution_cancellation"(p_execution_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."request_agent_execution_cancellation"(p_execution_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."reconcile_stale_agent_execution"(p_execution_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."reconcile_stale_agent_execution"(p_execution_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "private"."retry_agent_execution"(p_execution_id uuid, p_new_idempotency_key text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."retry_agent_execution"(p_execution_id uuid, p_new_idempotency_key text) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."heartbeat_agent_execution"(p_execution_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."heartbeat_agent_execution"(p_execution_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."heartbeat_agent_execution"(p_execution_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "public"."request_agent_execution_cancellation"(p_execution_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."request_agent_execution_cancellation"(p_execution_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."request_agent_execution_cancellation"(p_execution_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "public"."reconcile_stale_agent_execution"(p_execution_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."reconcile_stale_agent_execution"(p_execution_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reconcile_stale_agent_execution"(p_execution_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "public"."retry_agent_execution"(p_execution_id uuid, p_new_idempotency_key text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."retry_agent_execution"(p_execution_id uuid, p_new_idempotency_key text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."retry_agent_execution"(p_execution_id uuid, p_new_idempotency_key text) TO "service_role";
REVOKE ALL ON FUNCTION "private"."record_second_mission_conversion"() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "private"."agent_execution_approval_scope"(p_workspace_id uuid, p_mission_id uuid, p_mission_version bigint, p_action_id uuid, p_action_version bigint, p_agent_id uuid, p_authority jsonb, p_request jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "private"."agent_execution_payload_shape"(p_value jsonb, p_depth integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "private"."agent_execution_has_meaningful_value"(p_value jsonb, p_depth integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION "private"."complete_read_only_research_execution"(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text, p_error_message text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "private"."complete_read_only_research_execution"(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text, p_error_message text) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."complete_read_only_research_execution"(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text, p_error_message text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION "public"."complete_read_only_research_execution"(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text, p_error_message text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."complete_read_only_research_execution"(p_execution_id uuid, p_status text, p_result jsonb, p_evidence jsonb, p_error_code text, p_error_message text) TO "service_role";
