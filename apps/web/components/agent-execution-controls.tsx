"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentExecution } from "../lib/mission-repository";

type ExecutionAction = "REQUEST_CANCELLATION" | "RECONCILE" | "RETRY";

function failureLabel(code: string | null) {
  switch (code) {
    case "EXECUTION_LEASE_EXPIRED":
      return "No confirmed result arrived before the execution lease expired.";
    case "UPSTREAM_OUTCOME_UNKNOWN":
    case "PROVIDER_OUTCOME_UNKNOWN":
    case "EXECUTION_OUTCOME_UNKNOWN":
      return "The outcome is uncertain. Verify provider evidence before authorising any new attempt.";
    case "APPROVAL_REQUIRED":
      return "Required human approval was not available.";
    case "AGENT_AUTHORITY_CHANGED":
      return "Agent authority changed; review and approve the current scope before retrying.";
    default:
      return code ? `Execution error code: ${code.slice(0, 80)}` : "";
  }
}

export function AgentExecutionControls({ execution }: { execution: AgentExecution }) {
  const router = useRouter();
  const [busy, setBusy] = useState<ExecutionAction | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const leaseExpired = Date.parse(execution.leaseExpiresAt) <= Date.now();

  async function act(action: ExecutionAction) {
    if (busy) return;
    setBusy(action);
    setMessage("");
    setError("");
    const idempotencyKey = action === "RETRY" ? `retry-${crypto.randomUUID()}` : undefined;
    try {
      const response = await fetch(`/api/agent-executions/${execution.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, idempotencyKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "The execution action could not be completed.");
        return;
      }
      if (action === "REQUEST_CANCELLATION") {
        setMessage("Cancellation request recorded. The action may already have produced an external effect; wait for a confirmed final status.");
      } else if (action === "RECONCILE") {
        setMessage("The stale execution was marked UNKNOWN. Do not retry until its external outcome has been verified.");
      } else {
        setMessage("A new, linked retry attempt was created.");
      }
      router.refresh();
    } catch {
      setError("The execution service could not be reached. Refresh to verify the persisted state before trying again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="execution-recovery-controls">
      {execution.errorCode && <p className="action-hint">{failureLabel(execution.errorCode)}</p>}
      {execution.status === "RUNNING" && (
        <div className="approval-actions">
          {execution.cancelRequestedAt
            ? <p className="action-hint">Cancellation requested · awaiting a confirmed result.</p>
            : <button className="button button-small button-quiet" type="button" onClick={() => act("REQUEST_CANCELLATION")} disabled={busy !== null}>
                {busy === "REQUEST_CANCELLATION" ? "Recording…" : "Request cancellation"}
              </button>}
          {leaseExpired
            ? <button className="button button-small" type="button" onClick={() => act("RECONCILE")} disabled={busy !== null}>
                {busy === "RECONCILE" ? "Reconciling…" : "Reconcile stale run"}
              </button>
            : <button className="button button-small button-quiet" type="button" onClick={() => router.refresh()} disabled={busy !== null}>
                Refresh status
              </button>}
        </div>
      )}
      {(execution.status === "FAILED" || execution.status === "BLOCKED") && (
        <button className="button button-small" type="button" onClick={() => act("RETRY")} disabled={busy !== null}>
          {busy === "RETRY" ? "Creating retry…" : `Retry attempt ${execution.attemptNumber}`}
        </button>
      )}
      {execution.status === "UNKNOWN" && (
        <p className="field-error">Outcome unknown. Automatic retry is prohibited; confirm the external result before creating new work.</p>
      )}
      {execution.retryOfExecutionId && <p className="action-hint">Retry of execution {execution.retryOfExecutionId.slice(0, 8)}</p>}
      {message && <p role="status" className="action-hint">{message}</p>}
      {error && <p role="alert" className="field-error">{error}</p>}
    </div>
  );
}
