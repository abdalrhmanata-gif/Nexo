export type MissionPlanStep = { title: string; reason: string };
export type MissionPlan = {
  title: string;
  summary: string;
  successCriteria: string[];
  steps: MissionPlanStep[];
  clarifyingQuestions: string[];
};

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    successCriteria: {
      type: "array",
      items: { type: "string" },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          reason: { type: "string" },
        },
        required: ["title", "reason"],
      },
    },
    clarifyingQuestions: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["title", "summary", "successCriteria", "steps", "clarifyingQuestions"],
} as const;

export const DEFAULT_AI_MODEL = "gpt-6-luna";

type PlannerResponse = {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      type?: unknown;
      text?: unknown;
    }>;
  }>;
};

function extractOutputText(payload: PlannerResponse) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.join("");
}

export async function requestMissionPlan(
  goal: string,
  {
    apiKey,
    model = DEFAULT_AI_MODEL,
    requestId,
    fetchImpl = fetch,
  }: {
    apiKey: string;
    model?: string;
    requestId?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<MissionPlan> {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(requestId ? { "X-Client-Request-Id": requestId } : {}),
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "none" },
      instructions: [
        "You are ZAVQERA's mission planning copilot.",
        "Turn the user's goal into a specific, outcome-driven draft plan.",
        "Use only context supplied by the user; never invent personal facts.",
        "Return a concise title, useful outcome summary, 1-4 observable success criteria, and 3-6 ordered steps.",
        "Make every step specific and actionable. Avoid generic placeholders unless genuinely necessary.",
        "The first step should normally be reversible. Do not imply any external action was completed.",
        "Use each reason only to explain why that step matters; do not provide hidden chain-of-thought.",
        "If important information is missing, ask up to 3 concise clarifying questions while still giving the best useful draft.",
        "Do not claim completed actions or request passwords, secrets, payment details, or sensitive personal data.",
        "Suggest human review for legal, medical, financial, safety-critical, or irreversible decisions.",
        "This is a draft only: no tools, external actions, or data writes are available.",
      ].join(" "),
      input: goal,
      max_output_tokens: 450,
      verbosity: "low",
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "zavqera_mission_plan",
          strict: true,
          schema: PLAN_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(24_000),
    cache: "no-store",
  });

  if (!response.ok) {
    let providerError: { type?: unknown; code?: unknown; message?: unknown } = {};
    try {
      const body = await response.json() as { error?: { type?: unknown; code?: unknown; message?: unknown } };
      providerError = body.error ?? {};
    } catch {
      // Keep the provider failure classification even if the error body is not JSON.
    }

    console.error("[ZAVQERA_AI_PROVIDER_REJECTED]", {
      requestId,
      status: response.status,
      type: typeof providerError.type === "string" ? providerError.type : undefined,
      code: typeof providerError.code === "string" ? providerError.code : undefined,
      message: typeof providerError.message === "string"
        ? providerError.message.slice(0, 300)
        : undefined,
    });

    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (response.status >= 500) throw new Error("UPSTREAM_OUTCOME_UNKNOWN");
    throw new Error("UPSTREAM_REJECTED");
  }

  const payload = await response.json() as PlannerResponse;
  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error("INVALID_PROVIDER_RESPONSE");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("INVALID_PROVIDER_RESPONSE");
  }

  const plan = parsed as {
    title?: unknown;
    summary?: unknown;
    successCriteria?: unknown;
    steps?: unknown;
    clarifyingQuestions?: unknown;
  };

  if (
    typeof plan.title !== "string"
    || typeof plan.summary !== "string"
    || !Array.isArray(plan.successCriteria)
    || plan.successCriteria.length < 1
    || plan.successCriteria.length > 4
    || !plan.successCriteria.every((item) => typeof item === "string")
    || !Array.isArray(plan.steps)
    || plan.steps.length < 3
    || plan.steps.length > 6
    || !plan.steps.every((step) =>
      typeof step === "object"
      && step !== null
      && typeof step.title === "string"
      && typeof step.reason === "string")
    || !Array.isArray(plan.clarifyingQuestions)
    || plan.clarifyingQuestions.length > 3
    || !plan.clarifyingQuestions.every((item) => typeof item === "string")
  ) {
    throw new Error("INVALID_PLAN");
  }

  const successCriteria = plan.successCriteria
    .map((item) => item.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 4);
  const steps = plan.steps
    .map((step: { title: string; reason: string }) => ({
      title: step.title.trim().slice(0, 160),
      reason: step.reason.trim().slice(0, 300),
    }))
    .filter((step) => step.title && step.reason)
    .slice(0, 6);
  const clarifyingQuestions = plan.clarifyingQuestions
    .map((item) => item.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 3);

  if (!successCriteria.length || steps.length < 3) {
    throw new Error("INVALID_PLAN");
  }

  return {
    title: plan.title.trim().slice(0, 100),
    summary: plan.summary.trim().slice(0, 600),
    successCriteria,
    steps,
    clarifyingQuestions,
  };
}
