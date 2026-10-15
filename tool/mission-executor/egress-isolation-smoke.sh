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

docker run --detach \
  --name "$gateway_container" \
  --network "$internal_network" \
  --network-alias egress-gateway \
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
  --volume "$repo_root:/workspace:ro" \
  --workdir /workspace \
  node:22-bookworm-slim \
  node tool/mission-executor/isolated-executor-smoke.mjs

# Inspect counters only through docker exec from the test orchestrator. The isolated
# executor has no route to the provider container and never receives provider metrics.
provider_metrics="$(docker exec "$provider_container" node -e 'fetch("http://127.0.0.1:9090/__test/metrics").then((r) => r.json()).then((value) => process.stdout.write(JSON.stringify(value))).catch(() => process.exit(1))')"
PROVIDER_METRICS="$provider_metrics" node --input-type=module -e '
import assert from "node:assert/strict";
const metrics = JSON.parse(process.env.PROVIDER_METRICS ?? "null");
const expected = {
  "accepted-then-timeout": 2,
  "delayed-success": 2,
  "malformed-receipt": 2,
  "missing-receipt": 2,
  "normal": 3,
  "provider-429": 1,
  "provider-500": 1,
  "receipt-binding-mismatch": 2,
};
assert.deepEqual(metrics.requestsByScenario, expected, "provider request counts must match explicit caller submissions; the gateway must not retry invisibly");
assert.equal(metrics.requestCount, 15, "no implicit provider retries are permitted");
assert.equal(metrics.receiptCount, 6, "failed-before-acceptance scenarios must not create receipts");
process.stdout.write("PASS: exact fake-provider request counts; no hidden retries; receipt count remains consistent.\n");
'

echo "PASS: executor direct egress denied; gateway topology and fake-provider contract cases passed."
