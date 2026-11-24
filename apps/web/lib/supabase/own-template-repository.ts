import { createSupabaseServerClient } from "./server";
import { isTemplateId, type OwnTemplateContent } from "../own-templates.mjs";

export type OwnTemplate = OwnTemplateContent & { id: string; updatedAt: string };

/** Why the database refused a template write, in terms the page can explain. */
export type OwnTemplateRefusal = "plan" | "limit" | "missing" | "failed";

export class OwnTemplateError extends Error {
  readonly reason: OwnTemplateRefusal;
  constructor(reason: OwnTemplateRefusal) {
    super(reason);
    this.name = "OwnTemplateError";
    this.reason = reason;
  }
}

type TemplateRow = {
  id: string;
  name: string;
  intent: string;
  criteria: string[] | null;
  actions: string[] | null;
  updated_at: string;
};

const COLUMNS = "id, name, intent, criteria, actions, updated_at";

function toTemplate(row: TemplateRow): OwnTemplate {
  return {
    id: row.id,
    name: row.name,
    intent: row.intent ?? "",
    criteria: row.criteria ?? [],
    actions: row.actions ?? [],
    updatedAt: row.updated_at,
  };
}

function refusal(error: { code?: string; message?: string }): OwnTemplateError {
  if (error.message?.includes("TEMPLATE_LIMIT_REACHED")) return new OwnTemplateError("limit");
  // Row level security: the plan check in the insert and update policies.
  if (error.code === "42501" || error.message?.includes("row-level security")) return new OwnTemplateError("plan");
  return new OwnTemplateError("failed");
}

/**
 * The signed-in person's plan, as billing_overview reports it. Anything
 * unreadable is Free: a feature is never unlocked by an error.
 */
export async function readCurrentPlan(): Promise<string> {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.rpc("billing_overview");
    const row = Array.isArray(result.data) ? result.data[0] as { plan?: string } | undefined : undefined;
    return !result.error && typeof row?.plan === "string" ? row.plan : "free";
  } catch {
    return "free";
  }
}

/**
 * Own templates of the signed-in person. Ownership always comes from the
 * session: owner_id is filled in by the database and cannot be sent.
 */
export async function createOwnTemplateRepository() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Authentication required.");

  return {
    async list(): Promise<OwnTemplate[]> {
      const result = await supabase.from("user_templates").select(COLUMNS).order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      return (result.data as TemplateRow[]).map(toTemplate);
    },

    async get(id: string): Promise<OwnTemplate | null> {
      if (!isTemplateId(id)) return null;
      const result = await supabase.from("user_templates").select(COLUMNS).eq("id", id).maybeSingle();
      if (result.error) throw result.error;
      return result.data ? toTemplate(result.data as TemplateRow) : null;
    },

    async create(content: OwnTemplateContent): Promise<string> {
      const result = await supabase
        .from("user_templates")
        .insert({ name: content.name, intent: content.intent, criteria: content.criteria, actions: content.actions })
        .select("id")
        .single();
      if (result.error) throw refusal(result.error);
      return (result.data as { id: string }).id;
    },

    async rename(id: string, name: string): Promise<void> {
      if (!isTemplateId(id)) throw new OwnTemplateError("missing");
      const result = await supabase.from("user_templates").update({ name }).eq("id", id).select("id");
      if (result.error) throw refusal(result.error);
      if (!result.data?.length) throw new OwnTemplateError("missing");
    },

    async remove(id: string): Promise<void> {
      if (!isTemplateId(id)) throw new OwnTemplateError("missing");
      const result = await supabase.from("user_templates").delete().eq("id", id).select("id");
      if (result.error) throw refusal(result.error);
      if (!result.data?.length) throw new OwnTemplateError("missing");
    },
  };
}
