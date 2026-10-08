export type MissionResearchSource = { title: string; url: string };

export type MissionResearch = { summary: string; sources: MissionResearchSource[] };

export async function requestMissionResearch(
  mission: { name: string; intent: string; criteria: string[] },
  options: { apiKey: string; model?: string; requestId?: string; fetchImpl?: typeof fetch },
): Promise<MissionResearch> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...(options.requestId ? { "X-Client-Request-Id": options.requestId } : {}),
    },
    body: JSON.stringify({
      model: options.model ?? "gpt-6-luna",
      instructions: "Research this mission with live web search. Stay within the intent and success criteria. Read-only research only: do not purchase, book, contact anyone, submit forms, change accounts, or claim external actions were completed. Return concise findings, tradeoffs, uncertainties, and cite web sources.",
      input: JSON.stringify(mission),
      reasoning: { effort: "low" },
      tools: [{ type: "web_search", search_context_size: "medium" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      max_output_tokens: 2200,
      store: false,
    }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (response.status >= 500) throw new Error("UPSTREAM_OUTCOME_UNKNOWN");
    if (response.status === 400) throw new Error("INVALID_PROVIDER_REQUEST");
    throw new Error("UPSTREAM_REJECTED");
  }
  const payload = await response.json() as {
    output_text?: unknown;
    output?: Array<{ action?: { sources?: Array<{ url?: unknown; title?: unknown }> }; content?: Array<{ type?: unknown; text?: unknown; annotations?: Array<{ type?: unknown; url?: unknown; title?: unknown }> }> }>;
    status?: unknown;
  };
  if (payload.status === "incomplete") throw new Error("INCOMPLETE_PROVIDER_RESPONSE");
  const summary = typeof payload.output_text === "string"
    ? payload.output_text.trim()
    : (payload.output ?? []).flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text" && typeof part.text === "string").map((part) => part.text as string).join("").trim();
  if (!summary) throw new Error("INVALID_PROVIDER_RESPONSE");
  const sources: MissionResearchSource[] = [];
  const seen = new Set<string>();
  for (const item of payload.output ?? []) {
    for (const source of item.action?.sources ?? []) {
      if (typeof source.url === "string" && source.url.startsWith("http") && !seen.has(source.url)) {
        seen.add(source.url);
        sources.push({ title: typeof source.title === "string" && source.title.trim() ? source.title.trim().slice(0, 200) : source.url, url: source.url });
      }
    }
    for (const part of item.content ?? []) {
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === "url_citation" && typeof annotation.url === "string" && annotation.url.startsWith("http") && !seen.has(annotation.url)) {
          seen.add(annotation.url);
          sources.push({ title: typeof annotation.title === "string" && annotation.title.trim() ? annotation.title.trim().slice(0, 200) : annotation.url, url: annotation.url });
        }
      }
    }
  }
  return { summary: summary.slice(0, 12000), sources: sources.slice(0, 12) };
}
