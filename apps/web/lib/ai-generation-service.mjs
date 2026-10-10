export const AI_GENERATION_OUTCOMES = Object.freeze({
  SUCCESS: "success",
  QUOTA: "quota",
  PROVIDER_ERROR: "provider_error",
  SETTLEMENT_FAILED: "settlement_failed",
});

const KNOWN_PROVIDER_FAILURES = new Map([
  ["RATE_LIMITED", { kind: "definite", status: 429 }],
  ["UPSTREAM_OUTCOME_UNKNOWN", { kind: "unknown", status: 504 }],
  ["UPSTREAM_REJECTED", { kind: "definite", status: 502 }],
  ["INVALID_PLAN", { kind: "definite", status: 502 }],
  ["INVALID_PROVIDER_REQUEST", { kind: "definite", status: 502 }],
  ["INCOMPLETE_PROVIDER_RESPONSE", { kind: "definite", status: 502 }],
  ["INVALID_PROVIDER_RESPONSE", { kind: "definite", status: 502 }],
  ["AGENT_APPROVAL_REQUIRED", { kind: "definite", status: 409 }],
  ["AGENT_EXECUTION_ALREADY_EXISTS", { kind: "unknown", status: 409 }],
  ["AGENT_EXECUTION_START_FAILED", { kind: "definite", status: 503 }],
]);

export function classifyProviderFailure(error) {
  const code = error instanceof Error ? error.message : "";
  const known = KNOWN_PROVIDER_FAILURES.get(code);
  if (known) {
    return {
      kind: AI_GENERATION_OUTCOMES.PROVIDER_ERROR,
      disposition: known.kind === "unknown" ? "hold" : "release",
      status: known.status,
      code,
    };
  }

  // An abort, timeout, transport failure, or unexpected exception may mean the
  // provider accepted the request but the result never reached ZAVQERA.
  // Fail closed: keep the reservation for expiry/reconciliation.
  return {
    kind: AI_GENERATION_OUTCOMES.PROVIDER_ERROR,
    disposition: "hold",
    status: 504,
    code: "PROVIDER_OUTCOME_UNKNOWN",
  };
}

export async function runAiGeneration({
  requestId,
  reserve,
  prepare,
  generate,
  consume,
  release,
}) {
  const reservation = await reserve(requestId);
  if (!reservation?.allowed || !reservation?.reservation_id) {
    return {
      kind: AI_GENERATION_OUTCOMES.QUOTA,
      reservation,
    };
  }

  const reservationId = reservation.reservation_id;

  try {
    // Preparation is a server-side authorization gate. It must finish before
    // any provider request or other externally observable work begins.
    if (prepare) await prepare();

    const plan = await generate();

    try {
      await consume(reservationId);
    } catch {
      // Provider work may already have succeeded. Never release this reservation
      // automatically: doing so could allow an uncharged duplicate generation.
      return {
        kind: AI_GENERATION_OUTCOMES.SETTLEMENT_FAILED,
        reservationId,
      };
    }

    return {
      kind: AI_GENERATION_OUTCOMES.SUCCESS,
      plan,
    };
  } catch (error) {
    const classified = classifyProviderFailure(error);

    if (classified.disposition === "release") {
      // Known pre-dispatch or provider rejection means no usable result exists.
      // If release itself fails, fail closed by leaving the reservation intact.
      await release(reservationId).catch(() => undefined);
    }

    return {
      ...classified,
      reservationId,
    };
  }
}
