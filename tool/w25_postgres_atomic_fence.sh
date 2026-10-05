#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

PSQL=(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -At)

"${PSQL[@]}" <<'SQL'
DROP FUNCTION IF EXISTS authorize_attempt(text,text,text,integer,integer,integer,text,text,text,text);
DROP TABLE IF EXISTS execution_attempts;
DROP TABLE IF EXISTS authority_state;

CREATE TABLE authority_state (
  mission_id text PRIMARY KEY,
  organization_id text NOT NULL,
  principal_id text NOT NULL,
  authority_revision integer NOT NULL,
  mission_version integer NOT NULL,
  action_version integer NOT NULL,
  lease_id text NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  destination text NOT NULL,
  input_hash text NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  remaining_actions integer NOT NULL CHECK (remaining_actions >= 0)
);

CREATE TABLE execution_attempts (
  attempt_id bigserial PRIMARY KEY,
  mission_id text NOT NULL REFERENCES authority_state(mission_id),
  organization_id text NOT NULL,
  principal_id text NOT NULL,
  authority_revision integer NOT NULL,
  mission_version integer NOT NULL,
  action_version integer NOT NULL,
  lease_id text NOT NULL,
  destination text NOT NULL,
  input_hash text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  decision_reason text NOT NULL,
  state text NOT NULL CHECK (state IN ('AUTHORIZED','UNKNOWN','SUCCEEDED','FAILED','RECONCILED_NOT_SENT')),
  receipt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION authorize_attempt(
  p_mission_id text,
  p_organization_id text,
  p_principal_id text,
  p_authority_revision integer,
  p_mission_version integer,
  p_action_version integer,
  p_lease_id text,
  p_destination text,
  p_input_hash text,
  p_idempotency_key text
)
RETURNS TABLE(allowed boolean, reason text, attempt_id bigint)
LANGUAGE plpgsql
AS $function$
DECLARE
  v authority_state%ROWTYPE;
  existing execution_attempts%ROWTYPE;
  new_id bigint;
BEGIN
  SELECT * INTO v
    FROM authority_state
   WHERE mission_id = p_mission_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'MISSION_NOT_FOUND', NULL::bigint;
    RETURN;
  END IF;

  IF v.revoked THEN
    RETURN QUERY SELECT false, 'AUTHORITY_REVOKED', NULL::bigint;
    RETURN;
  END IF;

  IF v.organization_id <> p_organization_id
     OR v.principal_id <> p_principal_id
     OR v.authority_revision <> p_authority_revision
     OR v.mission_version <> p_mission_version
     OR v.action_version <> p_action_version
     OR v.lease_id <> p_lease_id
     OR v.destination <> p_destination
     OR v.input_hash <> p_input_hash THEN
    IF EXISTS (SELECT 1 FROM execution_attempts WHERE idempotency_key = p_idempotency_key) THEN
      RETURN QUERY SELECT false, 'IDEMPOTENCY_BINDING_MISMATCH', NULL::bigint;
    END IF;
    RETURN QUERY SELECT false, 'BINDING_MISMATCH', NULL::bigint;
    RETURN;
  END IF;

  IF v.lease_expires_at <= now() THEN
    RETURN QUERY SELECT false, 'LEASE_EXPIRED', NULL::bigint;
    RETURN;
  END IF;

  SELECT * INTO existing
    FROM execution_attempts
   WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF existing.state = 'UNKNOWN' THEN
      RETURN QUERY SELECT false, 'RECONCILE_REQUIRED', existing.attempt_id;
    END IF;
    RETURN QUERY SELECT false, 'IDEMPOTENCY_REPLAY', existing.attempt_id;
    RETURN;
  END IF;

  IF v.remaining_actions <= 0 THEN
    RETURN QUERY SELECT false, 'ACTION_BUDGET_EXHAUSTED', NULL::bigint;
    RETURN;
  END IF;

  UPDATE authority_state
     SET remaining_actions = remaining_actions - 1
   WHERE mission_id = p_mission_id;

  INSERT INTO execution_attempts (
    mission_id, organization_id, principal_id, authority_revision,
    mission_version, action_version, lease_id, destination, input_hash,
    idempotency_key, decision_reason, state
  )
  VALUES (
    p_mission_id, p_organization_id, p_principal_id, p_authority_revision,
    p_mission_version, p_action_version, p_lease_id, p_destination, p_input_hash,
    p_idempotency_key, 'ALLOW', 'AUTHORIZED'
  )
  RETURNING execution_attempts.attempt_id INTO new_id;

  RETURN QUERY SELECT true, 'ALLOW', new_id;
EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY SELECT false, 'IDEMPOTENCY_REPLAY', NULL::bigint;
END;
$function$;

INSERT INTO authority_state (
  mission_id, organization_id, principal_id, authority_revision,
  mission_version, action_version, lease_id, lease_expires_at,
  destination, input_hash, remaining_actions
) VALUES
  ('budget-one', 'org-a', 'user-a', 9, 3, 7, 'lease-a', now() + interval '10 minutes',
   'https://fake.external.test/action', 'hash-1', 1),
  ('idem-two', 'org-a', 'user-a', 9, 3, 7, 'lease-a', now() + interval '10 minutes',
   'https://fake.external.test/action', 'hash-1', 2),
  ('security-cases', 'org-a', 'user-a', 9, 3, 7, 'lease-a', now() + interval '10 minutes',
   'https://fake.external.test/action', 'hash-1', 3);
SQL

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

run_attempt() {
  local mission_id="$1"
  local organization_id="$2"
  local principal_id="$3"
  local revision="$4"
  local mission_version="$5"
  local action_version="$6"
  local lease_id="$7"
  local destination="$8"
  local input_hash="$9"
  local idempotency_key="${10}"
  local log="${11}"

  "${PSQL[@]}" >"${log}" <<SQL
BEGIN;
SELECT allowed || '|' || reason || '|' || coalesce(attempt_id::text,'')
  FROM authorize_attempt(
    '${mission_id}','${organization_id}','${principal_id}',
    ${revision},${mission_version},${action_version},
    '${lease_id}','${destination}','${input_hash}','${idempotency_key}'
  );
SELECT pg_sleep(1);
COMMIT;
SQL
}

run_attempt budget-one org-a user-a 9 3 7 lease-a https://fake.external.test/action hash-1 budget-idem-a "${tmpdir}/budget-a.log" &
p1=$!
run_attempt budget-one org-a user-a 9 3 7 lease-a https://fake.external.test/action hash-1 budget-idem-b "${tmpdir}/budget-b.log" &
p2=$!
wait "${p1}"
wait "${p2}"

budget_results="$(cat "${tmpdir}/budget-a.log" "${tmpdir}/budget-b.log" | grep '^true|\|^false|')"
[[ "$(grep -c '^true|ALLOW|' <<<"${budget_results}")" == "1" ]] || { echo "ASSERTION FAILED: exactly one ALLOW for one remaining budget"; cat "${tmpdir}"/budget-*.log; exit 1; }
[[ "$(grep -c '^false|ACTION_BUDGET_EXHAUSTED|' <<<"${budget_results}")" == "1" ]] || { echo "ASSERTION FAILED: second concurrent worker did not fail closed on budget"; cat "${tmpdir}"/budget-*.log; exit 1; }

budget_state="$("${PSQL[@]}" -c "SELECT remaining_actions FROM authority_state WHERE mission_id='budget-one';" | tail -1)"
budget_attempts="$("${PSQL[@]}" -c "SELECT count(*) FROM execution_attempts WHERE mission_id='budget-one';" | tail -1)"
[[ "${budget_state}" == "0" ]] || { echo "ASSERTION FAILED: remaining budget=${budget_state}"; exit 1; }
[[ "${budget_attempts}" == "1" ]] || { echo "ASSERTION FAILED: budget attempts=${budget_attempts}"; exit 1; }

run_attempt idem-two org-a user-a 9 3 7 lease-a https://fake.external.test/action hash-1 same-idempotency-key "${tmpdir}/idem-a.log" &
p3=$!
run_attempt idem-two org-a user-a 9 3 7 lease-a https://fake.external.test/action hash-1 same-idempotency-key "${tmpdir}/idem-b.log" &
p4=$!
wait "${p3}"
wait "${p4}"

idem_results="$(cat "${tmpdir}/idem-a.log" "${tmpdir}/idem-b.log" | grep '^true|\|^false|')"
[[ "$(grep -c '^true|ALLOW|' <<<"${idem_results}")" == "1" ]] || { echo "ASSERTION FAILED: exactly one idempotency ALLOW"; cat "${tmpdir}"/idem-*.log; exit 1; }
[[ "$(grep -c '^false|IDEMPOTENCY_REPLAY|' <<<"${idem_results}")" == "1" ]] || { echo "ASSERTION FAILED: duplicate idempotency key was not rejected"; cat "${tmpdir}"/idem-*.log; exit 1; }

idem_state="$("${PSQL[@]}" -c "SELECT remaining_actions FROM authority_state WHERE mission_id='idem-two';" | tail -1)"
idem_attempts="$("${PSQL[@]}" -c "SELECT count(*) FROM execution_attempts WHERE mission_id='idem-two';" | tail -1)"
[[ "${idem_state}" == "1" ]] || { echo "ASSERTION FAILED: duplicate idempotency consumed more than one budget"; exit 1; }
[[ "${idem_attempts}" == "1" ]] || { echo "ASSERTION FAILED: duplicate idempotency created more than one attempt"; exit 1; }

binding="$("${PSQL[@]}" -c "SELECT reason FROM authorize_attempt('idem-two','org-a','user-a',10,3,7,'lease-a','https://fake.external.test/action','hash-1','same-idempotency-key');" | tail -1)"
[[ "${binding}" == "IDEMPOTENCY_BINDING_MISMATCH" ]] || { echo "ASSERTION FAILED: changed authority revision reused idempotency key: ${binding}"; exit 1; }

unknown="$("${PSQL[@]}" -c "BEGIN; SELECT allowed || '|' || reason || '|' || attempt_id::text FROM authorize_attempt('security-cases','org-a','user-a',9,3,7,'lease-a','https://fake.external.test/action','hash-1','unknown-key'); UPDATE execution_attempts SET state='UNKNOWN' WHERE idempotency_key='unknown-key'; COMMIT; SELECT reason FROM authorize_attempt('security-cases','org-a','user-a',9,3,7,'lease-a','https://fake.external.test/action','hash-1','unknown-key');" | tail -1)"
[[ "${unknown}" == "RECONCILE_REQUIRED" ]] || { echo "ASSERTION FAILED: UNKNOWN result was not fenced until reconciliation: ${unknown}"; exit 1; }
"${PSQL[@]}" -c "UPDATE execution_attempts SET state='SUCCEEDED', receipt='external-123' WHERE idempotency_key='unknown-key';" >/dev/null
post_reconcile="$("${PSQL[@]}" -c "SELECT reason FROM authorize_attempt('security-cases','org-a','user-a',9,3,7,'lease-a','https://fake.external.test/action','hash-1','unknown-key');" | tail -1)"
[[ "${post_reconcile}" == "IDEMPOTENCY_REPLAY" ]] || { echo "ASSERTION FAILED: reconciled attempt was not stable"; exit 1; }

"${PSQL[@]}" -c "UPDATE authority_state SET revoked=true WHERE mission_id='security-cases';" >/dev/null
revoked="$("${PSQL[@]}" -c "SELECT reason FROM authorize_attempt('security-cases','org-a','user-a',9,3,7,'lease-a','https://fake.external.test/action','hash-1','revoked-key');" | tail -1)"
[[ "${revoked}" == "AUTHORITY_REVOKED" ]] || { echo "ASSERTION FAILED: revoked authority did not fail closed"; exit 1; }

"${PSQL[@]}" -c "UPDATE authority_state SET revoked=false, lease_expires_at=now()-interval '1 second' WHERE mission_id='security-cases';" >/dev/null
cross_tenant="$("${PSQL[@]}" -c "SELECT reason FROM authorize_attempt('security-cases','org-b','user-a',9,3,7,'lease-a','https://fake.external.test/action','hash-1','expired-key');" | tail -1)"
[[ "${cross_tenant}" == "BINDING_MISMATCH" ]] || { echo "ASSERTION FAILED: cross-tenant request was not rejected"; exit 1; }
expired_lease="$("${PSQL[@]}" -c "SELECT reason FROM authorize_attempt('security-cases','org-a','user-a',9,3,7,'lease-a','https://fake.external.test/action','hash-1','expired-key-2');" | tail -1)"
[[ "${expired_lease}" == "LEASE_EXPIRED" ]] || { echo "ASSERTION FAILED: expired lease did not fail closed"; exit 1; }

destination="$("${PSQL[@]}" -c "UPDATE authority_state SET lease_expires_at=now()+interval '10 minutes' WHERE mission_id='security-cases'; SELECT reason FROM authorize_attempt('security-cases','org-a','user-a',9,3,7,'lease-a','https://evil.example','hash-1','destination-key');" | tail -1)"
[[ "${destination}" == "BINDING_MISMATCH" ]] || { echo "ASSERTION FAILED: changed destination was not rejected"; exit 1; }

input_hash="$("${PSQL[@]}" -c "SELECT reason FROM authorize_attempt('security-cases','org-a','user-a',9,3,7,'lease-a','https://fake.external.test/action','tampered-hash','input-key');" | tail -1)"
[[ "${input_hash}" == "BINDING_MISMATCH" ]] || { echo "ASSERTION FAILED: changed input hash was not rejected"; exit 1; }

echo "W25_ATOMIC_FENCE=PASS"
echo "budget_concurrency=PASS"
echo "idempotency_uniqueness=PASS"
echo "idempotency_binding=PASS"
echo "unknown_reconciliation=PASS"
echo "revocation_lease_binding=PASS"
