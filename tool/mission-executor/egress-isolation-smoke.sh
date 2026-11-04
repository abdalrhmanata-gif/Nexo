#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
suffix="$$"
internal_network="zavqera-executor-internal-${suffix}"
external_network="zavqera-gateway-egress-${suffix}"
gateway_container="zavqera-fake-gateway-${suffix}"
provider_container="zavqera-fake-provider-${suffix}"
cleanup() {
  local status=$?
  trap - EXIT
  docker rm -f "$gateway_container" "$provider_container" >/dev/null 2>&1 || true
  docker network rm "$internal_network" >/dev/null 2>&1 || true
  docker network rm "$external_network" >/dev/null 2>&1 || true
  if docker container inspect "$gateway_container" >/dev/null 2>&1 \
    || docker container inspect "$provider_container" >/dev/null 2>&1 \
    || docker network inspect "$internal_network" >/dev/null 2>&1 \
    || docker network inspect "$external_network" >/dev/null 2>&1; then
    echo "Executor smoke test leaked a container or Docker network." >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT

gateway_token="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
if [[ ! "$gateway_token" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Failed to generate a fresh fake-gateway token." >&2
  exit 1
fi

docker network create --internal "$internal_network" >/dev/null
docker network create "$external_network" >/dev/null

docker run --detach \
  --name "$provider_container" \
  --network "$external_network" \
  --network-alias fake-provider \
  --volume "$repo_root:/workspace:ro" \
  --workdir /workspace \
  node:22-bookworm-slim \
  node tool/mission-executor/fake-provider.mjs >/dev/null

provider_ready=0
for attempt in $(seq 1 30); do
  if docker exec "$provider_container" node -e "fetch('http://127.0.0.1:9090/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    provider_ready=1
    break
  fi
  sleep 1
done
if [ "$provider_ready" -ne 1 ]; then
  docker logs "$provider_container" || true
  echo "Fake provider failed readiness." >&2
  exit 1
fi

# Capture the exact reachable fake-provider address so the isolated executor
# must prove it cannot bypass the gateway using a hard-coded IP.
provider_ip="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$provider_container")"
if [[ ! "$provider_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "Unable to determine the fake provider IPv4 address." >&2
  exit 1
fi

docker run --detach \
  --name "$gateway_container" \
  --network "$internal_network" \
  --network-alias egress-gateway \
  --env ZAVQERA_FAKE_GATEWAY_TOKEN="$gateway_token" \
  --volume "$repo_root:/workspace:ro" \
  --workdir /workspace \
  node:22-bookworm-slim \
  node tool/mission-executor/fake-egress-gateway.mjs >/dev/null

docker network connect "$external_network" "$gateway_container"

ready=0
for attempt in $(seq 1 30); do
  if docker exec "$gateway_container" node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  docker logs "$gateway_container" || true
  echo "Fake egress gateway failed readiness." >&2
  exit 1
fi

docker run --rm \
  --network "$internal_network" \
  --env ZAVQERA_FAKE_GATEWAY_TOKEN="$gateway_token" \
  --env ZAVQERA_FAKE_PROVIDER_IP="$provider_ip" \
  --volume "$repo_root:/workspace:ro" \
  --workdir /workspace \
  node:22-bookworm-slim \
  node tool/mission-executor/isolated-executor-smoke.mjs

# Metrics are inspected only by the test orchestrator inside the provider container.
# The isolated executor has no route to the provider and never receives these counters.
provider_metrics="$(docker exec "$provider_container" node -e 'fetch("http://127.0.0.1:9090/__test/metrics").then((r) => r.json()).then((value) => process.stdout.write(JSON.stringify(value))).catch(() => process.exit(1))')"
PROVIDER_METRICS="$provider_metrics" node --input-type=module -e '
import assert from "node:assert/strict";
const metrics = JSON.parse(process.env.PROVIDER_METRICS ?? "null");
const expectedDispatches = {
  "accepted-then-timeout": 1,
  "delayed-success": 1,
  "malformed-receipt": 1,
  "missing-receipt": 1,
  "normal": 3,
  "provider-429": 1,
  "provider-500": 1,
  "receipt-binding-mismatch": 1,
  "reconcile-receipt-mismatch": 1,
  "slow-reconcile": 1,
};
const expectedReconciliations = {
  "smoke-accepted-then-timeout": 1,
  "smoke-concurrent-not-found": 1,
  "smoke-client-cancel-after-accept": 1,
  "smoke-malformed-receipt": 1,
  "smoke-missing-receipt": 1,
  "smoke-provider-429": 1,
  "smoke-provider-500": 1,
  "smoke-reconcile-receipt-mismatch": 2,
  "smoke-receipt-binding-mismatch": 1,
  "smoke-slow-reconcile": 1,
};
assert.deepEqual(metrics.requestsByScenario, expectedDispatches, "dispatch requests must match explicit caller submissions; the gateway must not retry invisibly");
assert.deepEqual(metrics.reconciliationsByIdempotencyKey, expectedReconciliations, "UNKNOWN recovery must use the separate lookup path, not a second dispatch");
assert.equal(metrics.requestCount, 12, "dispatches must not be retried internally");
assert.equal(metrics.reconciliationCount, 11, "expected only explicit reconciliation requests");
assert.equal(metrics.receiptCount, 8, "failure-before-acceptance scenarios must not create receipts");
assert.equal(metrics.udpProbeCount, 0, "isolated executor UDP probe must not reach the listening fake-provider canary");
process.stdout.write("PASS: exact dispatch/reconciliation counts; no hidden retries; receipt ledger consistent.\n");
'

echo "PASS: executor direct egress denied; isolated gateway, lookup, and fake-provider contract passed."
