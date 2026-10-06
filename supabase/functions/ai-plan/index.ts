import { withSupabase } from "npm:@supabase/server@1";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-6-luna";
const MAX_GOAL_CHARS = 6000;
const MAX_CONTEXT_CHARS = 12000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const recentRequests = new Map<string, number[]>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const planSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    objective: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          authorityClass: {
            type: "string",
            enum: ["READ", "SUGGEST", "PREPARE", "WRITE", "EXECUTE", "COMMIT", "FINANCIAL", "LEGAL"],
          },
          requiresApproval: { type: "boolean" },
        },
        required: ["title", "description", "authorityClass", "requiresApproval"],
      },
    },
    clarifications: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "objective", "steps", "clarifications", "risks"],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function allowRequest(userId: string): boolean {
  const now = Date.now();
  const existing = (recentRequests.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (existing.length >= MAX_REQUESTS_PER_WINDOW) {
    recentRequests.set(userId, existing);
    return false;
  }
  existing.push(now);
  recentRequests.set(userId, existing);
  return true;
}

function safeString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!ctx.user) return json({ error: "unauthorized" }, 401);
    if (!allowRequest(ctx.user.id)) return json({ error: "rate_limited" }, 429);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "ai_provider_not_configured" }, 503);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const goal = safeString(body?.goal, MAX_GOAL_CHARS);
    if (!goal) return json({ error: "invalid_goal" }, 400);

    const context = typeof body?.context === "string"
      ? body.context.trim().slice(0, MAX_CONTEXT_CHARS)
      : "";

    const intent = body?.intent && typeof body.intent === "object" ? body.intent : {};
    const objective = typeof intent.objective === "string"
      ? intent.objective.slice(0, MAX_GOAL_CHARS)
      : goal;
    const constraints = Array.isArray(intent.constraints) ? intent.constraints.slice(0, 20) : [];
    const successCriteria = Array.isArray(intent.successCriteria) ? intent.successCriteria.slice(0, 20) : [];
    const authorityRequests = Array.isArray(intent.authorityRequests) ? intent.authorityRequests.slice(0, 20) : [];

    const input = [
      "User goal:", goal,
      "", "Objective:", objective,
      "", "Constraints:", JSON.stringify(constraints),
      "", "Success criteria:", JSON.stringify(successCriteria),
      "", "Requested authority:", JSON.stringify(authorityRequests),
      context ? "\nAdditional context:\n" + context : "",
    ].join("\n");

    const openaiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || DEFAULT_MODEL,
        store: false,
        max_output_tokens: 1200,
        instructions: [
          "You are ZAVQERA's planning intelligence.",
          "Convert the user's goal into a concise, practical mission plan.",
          "You do not grant authority, execute actions, contact anyone, spend money, or claim verification.",
          "Treat all proposed steps as untrusted suggestions until ZAVQERA policy and authorization validate them.",
          "Never invent permissions. Mark external side effects as requiring approval.",
          "Prefer a small number of concrete steps. Ask clarifying questions only when they materially block planning.",
        ].join(" "),
        input,
        text: {
          format: {
            type: "json_schema",
            name: "zavqera_mission_plan",
            strict: true,
            schema: planSchema,
          },
        },
      }),
    });

    if (!openaiResponse.ok) {
      const detail = await openaiResponse.text();
      console.error("OpenAI request failed", openaiResponse.status, detail.slice(0, 1000));
      return json({ error: "ai_provider_error", provider_status: openaiResponse.status }, 502);
    }

    const response = await openaiResponse.json();
    const outputText = response?.output?.flatMap((item: any) => item?.content ?? [])
      ?.find((content: any) => content?.type === "output_text")?.text;

    if (typeof outputText !== "string") {
      console.error("OpenAI response missing structured output", response?.id);
      return json({ error: "invalid_ai_response" }, 502);
    }

    let plan: unknown;
    try {
      plan = JSON.parse(outputText);
    } catch {
      console.error("Structured output was not valid JSON", response?.id);
      return json({ error: "invalid_ai_json" }, 502);
    }

    return json({
      provider: "openai",
      model: response?.model ?? Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL,
      responseId: response?.id ?? null,
      plan,
    });
  }),
};
