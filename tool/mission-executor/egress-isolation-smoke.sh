#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
suffix="$$"
internal_network="zavqera-executor-internal-${suffix}"
external_network="zavqera-gateway-egress-${suffix}"
gateway_container="zavqera-fake-gateway-${suffix}"
provider_container="zavqera-fake-provider-${suffix}"
cleanup() {
  docker rm -f "$gateway_container" "$provider_container" >/dev/null 2>&1 || true
  docker network rm "$internal_network" >/dev/null 2>&1 || true
  docker network rm "$external_network" >/dev/null 2>&1 || true
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

cleanup
trap - EXIT
if docker network inspect "$internal_network" >/dev/null 2>&1 || docker network inspect "$external_network" >/dev/null 2>&1; then
  echo "Executor smoke test left Docker networks behind." >&2
  exit 1
fi
echo "PASS: temporary executor/gateway networks cleaned up."
