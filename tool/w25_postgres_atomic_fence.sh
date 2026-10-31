#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${ZAVQERA_W25_DISPOSABLE:?This test is allowed only with the disposable-workflow sentinel}"

if [[ "${ZAVQERA_W25_DISPOSABLE}" != "1" ]]; then
  echo "REFUSED: ZAVQERA_W25_DISPOSABLE must equal 1."
  exit 1
fi

# Refuse non-loopback endpoints and any database other than the named disposable fixture.
# The URL is read from the environment and is never printed.
python3 - <<'PY'
import os
import sys
from urllib.parse import urlparse

try:
    parsed = urlparse(os.environ["DATABASE_URL"])
    allowed = (
        parsed.scheme in {"postgres", "postgresql"}
        and parsed.hostname in {"127.0.0.1", "localhost"}
        and parsed.port == 5432
        and parsed.username == "postgres"
        and parsed.path == "/zavqera_w25"
    )
except (KeyError, ValueError):
    allowed = False

if not allowed:
    print("REFUSED: W25 accepts only postgres@127.0.0.1:5432/zavqera_w25.")
    sys.exit(1)
PY

PSQL=(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1)

server_version_num="$("${PSQL[@]}" -Atc "SHOW server_version_num;")"
if [[ ! "${server_version_num}" =~ ^[0-9]+$ ]] || (( server_version_num / 10000 != 17 )); then
  echo "REFUSED: W25 requires PostgreSQL major version 17."
  exit 1
fi

identity="$("${PSQL[@]}" -Atc "SELECT current_database() || '|' || current_user;")"
if [[ "${identity}" != "zavqera_w25|postgres" ]]; then
  echo "REFUSED: Connected database/user did not match the disposable W25 fixture."
  exit 1
fi

# Use a run-unique schema. Never DROP pre-existing application tables or schemas.
schema="w25_fence_${GITHUB_RUN_ID:-local}_${GITHUB_RUN_ATTEMPT:-1}_$$_${RANDOM}"
if [[ ! "${schema}" =~ ^w25_fence_[A-Za-z0-9_]+$ ]]; then
  echo "REFUSED: Generated schema name was not safe."
  exit 1
fi

schema_created=0
tmpdir="$(mktemp -d)"
cleanup() {
  if (( schema_created == 1 )); then
    PGOPTIONS="" "${PSQL[@]}" -c "DROP SCHEMA IF EXISTS \\"${schema}\\" CASCADE;" >/dev/null 2>&1 || true
  fi
  rm -rf "${tmpdir}"
}
trap cleanup EXIT

"${PSQL[@]}" -c "CREATE SCHEMA \\"${schema}\\";"
schema_created=1
export PGOPTIONS="-c search_path=${schema},public"

"${PSQL[@]}" <<'SQL'
CREATE TABLE authority_state (
  mission_id text PRIMARY KEY,
  remaining_actions integer NOT NULL CHECK (remaining_actions >= 0)
);

CREATE TABLE execution_attempts (
  attempt_id bigserial PRIMARY KEY,
  mission_id text NOT NULL REFERENCES authority_state(mission_id),
  idempotency_key text NOT NULL UNIQUE
);

INSERT INTO authority_state(mission_id, remaining_actions)
VALUES ('budget-one', 1), ('idem-two', 2);
SQL

run_reservation() {
  local mission_id="$1"
  local idempotency_key="$2"
  local log="$3"

  set +e
  "${PSQL[@]}" >"${log}" 2>&1 <<SQL
BEGIN;
SELECT remaining_actions
  FROM authority_state
 WHERE mission_id = '${mission_id}'
 FOR UPDATE;
SELECT pg_sleep(1);
WITH changed AS (
  UPDATE authority_state
     SET remaining_actions = remaining_actions - 1
   WHERE mission_id = '${mission_id}'
     AND remaining_actions > 0
  RETURNING mission_id
)
INSERT INTO execution_attempts(mission_id, idempotency_key)
SELECT mission_id, '${idempotency_key}' FROM changed;
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM execution_attempts
     WHERE mission_id = '${mission_id}'
       AND idempotency_key = '${idempotency_key}'
  ) THEN
    RAISE EXCEPTION 'RESERVATION_NOT_CREATED';
  END IF;
END
\$\$;
COMMIT;
SQL
  return $?
}

run_reservation "budget-one" "budget-idem-a" "${tmpdir}/budget-a.log" &
p1=$!
run_reservation "budget-one" "budget-idem-b" "${tmpdir}/budget-b.log" &
p2=$!

set +e
wait "${p1}"; s1=$?
wait "${p2}"; s2=$?
set -e

successes=0
(( s1 == 0 )) && successes=$((successes + 1))
(( s2 == 0 )) && successes=$((successes + 1))
if [[ "${successes}" -ne 1 ]]; then
  echo "ASSERTION FAILED: expected exactly one budget reservation winner; statuses=${s1},${s2}"
  cat "${tmpdir}/budget-a.log"
  cat "${tmpdir}/budget-b.log"
  exit 1
fi

if ! grep -q "RESERVATION_NOT_CREATED" "${tmpdir}/budget-a.log" "${tmpdir}/budget-b.log"; then
  echo "ASSERTION FAILED: budget-race loser did not fail at the reservation guard."
  cat "${tmpdir}/budget-a.log"
  cat "${tmpdir}/budget-b.log"
  exit 1
fi

budget_state="$("${PSQL[@]}" -Atc "SELECT remaining_actions FROM authority_state WHERE mission_id = 'budget-one';")"
budget_attempts="$("${PSQL[@]}" -Atc "SELECT count(*) FROM execution_attempts WHERE mission_id = 'budget-one';")"

[[ "${budget_state}" == "0" ]] || { echo "ASSERTION FAILED: remaining budget=${budget_state}"; exit 1; }
[[ "${budget_attempts}" == "1" ]] || { echo "ASSERTION FAILED: budget attempts=${budget_attempts}"; exit 1; }

run_reservation "idem-two" "same-idempotency-key" "${tmpdir}/idem-a.log" &
p3=$!
run_reservation "idem-two" "same-idempotency-key" "${tmpdir}/idem-b.log" &
p4=$!

set +e
wait "${p3}"; s3=$?
wait "${p4}"; s4=$?
set -e

successes=0
(( s3 == 0 )) && successes=$((successes + 1))
(( s4 == 0 )) && successes=$((successes + 1))
if [[ "${successes}" -ne 1 ]]; then
  echo "ASSERTION FAILED: expected exactly one idempotency winner; statuses=${s3},${s4}"
  cat "${tmpdir}/idem-a.log"
  cat "${tmpdir}/idem-b.log"
  exit 1
fi

if ! grep -Eqi "duplicate key value violates unique constraint" "${tmpdir}/idem-a.log" "${tmpdir}/idem-b.log"; then
  echo "ASSERTION FAILED: idempotency-race loser did not fail on the unique constraint."
  cat "${tmpdir}/idem-a.log"
  cat "${tmpdir}/idem-b.log"
  exit 1
fi

idem_state="$("${PSQL[@]}" -Atc "SELECT remaining_actions FROM authority_state WHERE mission_id = 'idem-two';")"
idem_attempts="$("${PSQL[@]}" -Atc "SELECT count(*) FROM execution_attempts WHERE mission_id = 'idem-two';")"
idem_keys="$("${PSQL[@]}" -Atc "SELECT count(DISTINCT idempotency_key) FROM execution_attempts WHERE mission_id = 'idem-two';")"

[[ "${idem_state}" == "1" ]] || { echo "ASSERTION FAILED: remaining idempotency budget=${idem_state}"; exit 1; }
[[ "${idem_attempts}" == "1" ]] || { echo "ASSERTION FAILED: idempotency attempts=${idem_attempts}"; exit 1; }
[[ "${idem_keys}" == "1" ]] || { echo "ASSERTION FAILED: distinct idempotency keys=${idem_keys}"; exit 1; }

echo "postgres_major=17"
echo "schema_isolation=PASS"
echo "W25_ATOMIC_FENCE=PASS"
echo "budget_concurrency=PASS"
echo "idempotency_uniqueness=PASS"
