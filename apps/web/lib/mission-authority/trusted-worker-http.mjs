import { isTrustedExecutionWorkerRequest } from "./worker-auth.mjs";
import { runMissionActionWorker } from "./mission-action-worker-boundary.mjs";
import { PERSISTENT_DISPATCH_DECISIONS } from "./persistent-dispatch-gateway.mjs";

const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INTERNAL_BODY_BYTES = 160_000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Shared request gate used by the production Next.js route and the local HTTP
 * integration harness. It never creates a privileged client or performs I/O.
 */
export async function parseTrustedWorkerRequest(request, expectedToken) {
  if (typeof expectedToken !== "string" || !TOKEN_PATTERN.test(expectedToken)) {
    return { ok: false, status: 503, body: { error: "Trusted execution worker is not configured." } };
  }
  if (!isTrustedExecutionWorkerRequest(request.headers.get("authorization"), expectedToken)) {
    return { ok: false, status: 401, body: { error: "Trusted worker authorization required." } };
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INTERNAL_BODY_BYTES) {
    return { ok: false, status: 413, body: { error: "Worker request is too large." } };
  }

  let rawBody = "";
  if (request.body) {
    const reader = request.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) {
          await reader.cancel("Invalid request body chunk").catch(() => undefined);
          return { ok: false, status: 400, body: { error: "A valid worker operation is required." } };
        }
        if (totalBytes + value.byteLength > MAX_INTERNAL_BODY_BYTES) {
          // Stop consuming a streamed/chunked body as soon as the byte ceiling is crossed.
          await reader.cancel("Worker request exceeds the body limit").catch(() => undefined);
          return { ok: false, status: 413, body: { error: "Worker request is too large." } };
        }
        chunks.push(value);
        totalBytes += value.byteLength;
      }
    } catch {
      return { ok: false, status: 400, body: { error: "A valid worker operation is required." } };
    } finally {
      try { reader.releaseLock(); } catch { /* A cancelled stream can already be detached. */ }
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    rawBody = new TextDecoder().decode(bytes);
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, body: { error: "A valid worker operation is required." } };
  }
  if (!isRecord(body)) {
    return { ok: false, status: 400, body: { error: "A worker operation is required." } };
  }
  return { ok: true, body };
}

/**
 * Creates the dispatch/reconciliation operation handler. Production passes
 * statically imported trusted dependencies; requests can never supply them.
 * Tests may inject local-only doubles without adding a production registry
 * entry or an environment-controlled provider override.
 */
export function createMissionActionWorkerOperationHandler({
  resolveAdapter,
  createClient,
  dispatch,
  reconcile,
}) {
  if (typeof resolveAdapter !== "function"
      || typeof createClient !== "function"
      || typeof dispatch !== "function"
      || typeof reconcile !== "function") {
    throw new TypeError("TRUSTED_WORKER_DEPENDENCIES_REQUIRED");
  }

  return async function handleMissionActionWorkerOperation({ workerBody, executionId }) {
    if (!isRecord(workerBody)) {
      return { status: 400, body: { error: "A worker operation is required." } };
    }
    const bodyKeys = Object.keys(workerBody);
    if (bodyKeys.some((key) => key !== "operation" && key !== "audience")
        || (workerBody.operation !== "dispatch" && workerBody.operation !== "reconcile")
        || typeof workerBody.audience !== "string"
        || !workerBody.audience.trim()
        || workerBody.audience.length > 128) {
      return { status: 400, body: { error: "Only a valid operation and provider audience are accepted." } };
    }
    if (typeof executionId !== "string" || !UUID_PATTERN.test(executionId)) {
      return { status: 400, body: { error: "A valid execution id is required." } };
    }

    try {
      const operation = await runMissionActionWorker({
        audience: workerBody.audience,
        operation: workerBody.operation,
        executionId,
        resolveAdapter,
        createClient,
        dispatch,
        reconcile,
      });
      if (operation.kind === "missing_adapter") {
        return { status: 503, body: { error: "No reviewed provider adapter is registered. No provider call occurred." } };
      }
      if (operation.kind === "missing_dispatch") {
        return { status: 503, body: { error: "The registered provider adapter has no reviewed dispatch implementation." } };
      }
      if (operation.kind === "missing_reconciliation") {
        return { status: 503, body: { error: "The registered provider adapter has no reviewed reconciliation implementation." } };
      }
      if (operation.kind !== "completed") {
        return { status: 400, body: { error: "Only dispatch or reconciliation is accepted." } };
      }

      const result = operation.result;
      const status = result.decision === PERSISTENT_DISPATCH_DECISIONS.DISPATCHED
        || result.decision === PERSISTENT_DISPATCH_DECISIONS.RECONCILED
        ? 200
        : result.decision === PERSISTENT_DISPATCH_DECISIONS.DENY ? 409 : 202;
      return { status, body: result };
    } catch {
      return {
        status: 503,
        body: { error: "Trusted worker operation could not be completed. Inspect the execution record before retrying." },
      };
    }
  };
}
