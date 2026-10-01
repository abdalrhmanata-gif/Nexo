#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

PSQL=(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1)

"${PSQL[@]}" <<'SQL'
DROP TABLE IF EXISTS execution_attempts;
DROP TABLE IF EXISTS authority_state;

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

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

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
DO $$
BEGIN
  IF (SELECT remaining_actions FROM authority_state WHERE mission_id = '${mission_id}') < 1 THEN
    RAISE EXCEPTION 'BUDGET_EXHAUSTED';
  END IF;
END
$$;
UPDATE authority_state
   SET remaining_actions = remaining_actions - 1
 WHERE mission_id = '${mission_id}';
INSERT INTO execution_attempts(mission_id, idempotency_key)
VALUES ('${mission_id}', '${idempotency_key}');
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

successes=$(( (s1 == 0 ? 1 : 0) + (s2 == 0 ? 1 : 0) ))
if [[ "${successes}" -ne 1 ]]; then
  echo "ASSERTION FAILED: expected exactly one budget reservation winner; statuses=${s1},${s2}"
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

successes=$(( (s3 == 0 ? 1 : 0) + (s4 == 0 ? 1 : 0) ))
if [[ "${successes}" -ne 1 ]]; then
  echo "ASSERTION FAILED: expected exactly one idempotency winner; statuses=${s3},${s4}"
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

echo "W25_ATOMIC_FENCE=PASS"
echo "budget_concurrency=PASS"
echo "idempotency_uniqueness=PASS"
