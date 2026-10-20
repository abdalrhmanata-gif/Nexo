import { withSupabase } from "npm:@supabase/server@1";
import { readBoundedBody } from "./request_body.ts";
import { resolveConfiguredModel } from "./model_config.ts";

const OPENAI_URL = "https://api.openai.com/v1/responses";
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

  // Bound stale per-user entries in long-lived function instances.
  if (recentRequests.size > 1000) {
    for (const [id, timestamps] of recentRequests) {
      if (!timestamps.some((timestamp) => now - timestamp < WINDOW_MS)) {
        recentRequests.delete(id);
      }
    }
  }
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
    const userId = ctx.userClaims?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);
    if (!allowRequest(userId)) return json({ error: "rate_limited" }, 429);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "ai_provider_not_configured" }, 503);

    // Never guess a model identifier: provider calls can incur cost and must be
    // explicitly configured against an available model for this project.
    const model = resolveConfiguredModel(Deno.env.get("OPENAI_MODEL"));
    if (!model) return json({ error: "ai_model_not_configured" }, 503);

    let rawBody: string;
    try {
      rawBody = await readBoundedBody(req);
    } catch (error) {
      if (error instanceof RangeError) {
        return json({ error: "request_body_too_large" }, 413);
      }
      return json({ error: "invalid_request_body" }, 400);
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "invalid_request_body" }, 400);
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

    let openaiResponse: Response;
    try {
      openaiResponse = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
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
    } catch {
      console.error("OpenAI request could not be completed");
      return json({ error: "ai_provider_unavailable" }, 502);
    }

    if (!openaiResponse.ok) {
      await openaiResponse.body?.cancel();
      console.error("OpenAI request failed", openaiResponse.status);
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
      model: response?.model ?? model,
      responseId: response?.id ?? null,
      plan,
    });
  }),
};
