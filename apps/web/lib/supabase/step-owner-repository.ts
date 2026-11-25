import { createSupabaseServerClient, getAuthenticatedUser } from "./server";
import { isSupabaseConfigured } from "./config";
import { parseStepOwners, ownerRefusal, type StepOwners } from "../step-owners.mjs";

// Step owners are read and changed apart from the Mission itself, so the
// Mission repository (which assistants connected over MCP also use) does not
// change, and a failure here never breaks the Mission page: it shows the
// steps without owners. The one read of the steps table itself (the steps
// assigned to you) lives in mission-repository.ts, the only file allowed to
// read the Mission tables directly (tool/static_contract_check.py).

/** Why an owner change was refused, with a sentence the page can show. */
export class StepOwnerError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "StepOwnerError";
    this.status = status;
  }
}

/** Owners, editors and whether the reader may change them; null if unavailable. */
export async function readStepOwners(missionId: string): Promise<StepOwners | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const [supabase, user] = await Promise.all([createSupabaseServerClient(), getAuthenticatedUser()]);
    if (!user) return null;
    const found = await supabase.rpc("mission_step_owners", { p_mission_id: missionId });
    if (found.error) return null;
    return parseStepOwners(found.data, user.id);
  } catch {
    return null;
  }
}

/** Names the owner of an open step, or clears it with null. */
export async function setStepOwner(input: { actionId: string; expectedVersion: number; assigneeId: string | null }) {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser();
  if (!user) throw new StepOwnerError("Your session has expired. Sign in again to continue.", 401);
  const result = await supabase.rpc("set_mission_action_assignee", {
    p_action_id: input.actionId,
    p_expected_version: input.expectedVersion,
    p_assignee_id: input.assigneeId,
  });
  if (result.error) {
    const message = `${result.error.message ?? ""} ${result.error.code ?? ""}`;
    const status = message.includes("STALE_VERSION") ? 409
      : message.includes("FORBIDDEN") || message.includes("42501") ? 403
        : message.includes("ASSIGNEE_") ? 422
          : 500;
    throw new StepOwnerError(ownerRefusal(message), status);
  }
  const row = result.data as { id: string; version: number; assignee_id: string | null; title?: string; mission_id?: string } | null;
  return {
    id: row?.id ?? input.actionId,
    version: row?.version ?? input.expectedVersion,
    assigneeId: row?.assignee_id ?? null,
    title: row?.title ?? "",
    missionId: row?.mission_id ?? "",
    actorId: user.id,
    actorEmail: user.email ?? "",
  };
}
