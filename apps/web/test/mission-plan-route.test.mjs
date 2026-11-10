import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(webRoot, file), "utf8");

// A second route that spends money is a second chance to leave a gate open.
// These are the properties the first route is held to, asserted again here,
// plus the one that only matters once there are two: that both reach the
// provider through the same guarded path rather than each with its own copy.

test("the plan route passes the same gates as the brief route", () => {
  const route = read("app/api/missions/plan/route.ts");
  assert.match(route, /isTrustedSameOriginRequest/);
  assert.match(route, /isSupabaseConfigured\(\)/);
  assert.match(route, /getAuthenticatedUser/);
  assert.match(route, /isApprovedPreviewTester/);
  assert.match(route, /describeProvider\(\)/);
  assert.match(route, /rateLimit\(/);
  assert.match(route, /readLimitedBody\(request, MAX_PLAN_REQUEST_BYTES\)/);
  assert.match(route, /normalizeMissionPlanRequest/);
  assert.match(route, /validateMissionPlanReport/);
  assert.doesNotMatch(route, /console\.(log|error)\(/);
});

test("an unapproved tester is turned away before provider configuration is read", () => {
  // Otherwise the refusal itself tells a stranger whether a provider is set
  // up on this deployment.
  const route = read("app/api/missions/plan/route.ts");
  const allowlistAt = route.indexOf("if (!isApprovedPreviewTester(user.id))");
  const configAt = route.indexOf("const provider = describeProvider()");
  assert.ok(allowlistAt >= 0 && configAt > allowlistAt,
    "the allowlist check must come first");
});

test("both paid routes reach the provider through one guarded runner", () => {
  const plan = read("app/api/missions/plan/route.ts");
  assert.match(plan, /runGuardedJsonCompletion/);
  // The route must not open its own connection to the provider: that is the
  // copy that would quietly skip the quota.
  assert.doesNotMatch(plan, /fetch\(config\.endpoint/);
  assert.doesNotMatch(plan, /reserve_ai_generation/);
  assert.doesNotMatch(plan, /Authorization/);
});

test("the guarded runner spends the generation before calling the provider", () => {
  // A timeout or a retry must not buy a free generation, so the consume
  // happens first and is released if it fails.
  const run = read("lib/ai/run.ts");
  const consumeAt = run.indexOf('"consume_ai_generation"');
  const fetchAt = run.indexOf("fetch(config.endpoint");
  assert.ok(consumeAt > 0 && fetchAt > consumeAt,
    "the generation must be consumed before the provider is contacted");
  assert.match(run, /release_ai_generation/);
  assert.match(run, /AbortController/);
  assert.match(run, /max_completion_tokens/);
  assert.match(run, /response_format: \{ type: "json_object" \}/);
  // Telemetry carries cost and quota, never prompts or who asked.
  const telemetry = run.slice(run.indexOf("[zavqera-ai-cost]"), run.indexOf("[zavqera-ai-cost]") + 700);
  assert.doesNotMatch(telemetry, /prompt\.|input\.|user\.id|apiKey/);
});

test("the key never leaves the gate", () => {
  // It is read from the environment, handed to one fetch, and appears
  // nowhere else — not in a response, a log line or a cost record.
  for (const file of ["lib/ai/gate.ts", "lib/ai/run.ts", "app/api/missions/plan/route.ts"]) {
    const body = read(file);
    for (const line of body.split("\n")) {
      if (!/apiKey/.test(line)) continue;
      const allowed = /const apiKey = process\.env|apiKey: string|apiKey,|Bearer \$\{config\.apiKey\}|apiKey \|\| !model|!apiKey/.test(line);
      assert.ok(allowed, `unexpected use of the key in ${file}: ${line.trim()}`);
    }
  }
});

test("the plan the route returns says plainly that nothing was looked up", () => {
  const route = read("app/api/missions/plan/route.ts");
  assert.match(route, /sourcesFetchedByZavqera: false/);
});

test("the interface saves nothing until the person adds it", () => {
  const panel = read("components/ai-mission-plan.tsx");
  // The draft lives in component state; the only write is the ordinary
  // per-action endpoint, one step at a time, on an explicit click.
  assert.match(panel, /useState<MissionPlanReport \| null>\(null\)/);
  assert.match(panel, /\/api\/missions\/\$\{missionId\}\/actions/);
  assert.match(panel, /onClick=\{addSteps\}/);
  assert.doesNotMatch(panel, /useEffect\([^)]*draft/, "a plan must never be drafted without a click");
});

test("every reason a provider is refused has its own message", () => {
  // The point of naming the reasons is that each one reads differently.
  // A table where two of them collapse back to the same sentence would pass
  // the type checker and teach the reader nothing.
  const gate = read("lib/ai/gate.ts");
  const reasons = [...gate.matchAll(/reason: "([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(reasons.length >= 6, `expected every refusal to be named, found ${reasons.length}`);

  for (const file of ["app/api/missions/plan/route.ts", "app/api/opportunities/analyze/route.ts"]) {
    const body = read(file);
    const table = /const PROVIDER_REFUSAL: Record<string, string> = \{([\s\S]*?)\n\};/.exec(body);
    assert.ok(table, `${file} must map every refusal to a message`);
    const messages = [...table[1].matchAll(/:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    for (const reason of new Set(reasons)) {
      assert.match(table[1], new RegExp(`"${reason}"`), `${file} does not explain "${reason}"`);
    }
    assert.equal(new Set(messages).size, messages.length,
      `${file} gives two refusals the same wording, which is the problem this replaced`);
  }
});

test("the readiness check costs nothing and still guards what it reveals", () => {
  // Its whole point is that an owner can learn a model name is wrong without
  // paying a generation to find out. If it ever reserves, consumes or calls,
  // it has become the thing it replaced.
  const route = read("app/api/missions/plan/route.ts");
  const get = route.slice(route.indexOf("export async function GET()"), route.indexOf("export async function POST"));
  assert.ok(get.length > 200, "the GET handler has moved or been removed");
  assert.doesNotMatch(get, /runGuardedJsonCompletion|reserve_ai_generation|consume_ai_generation|fetch\(/,
    "the readiness check must not spend a generation or contact the provider");
  assert.match(get, /describeProvider\(\)/);

  // And it must not hand configuration details to someone who is not allowed
  // to use the feature: the allowlist comes before the reason is read.
  const allowlistAt = get.indexOf("isApprovedPreviewTester");
  const describeAt = get.indexOf("describeProvider()");
  assert.ok(allowlistAt > 0 && describeAt > allowlistAt,
    "the allowlist must be checked before the configuration is described");
  assert.match(get, /AUTH_REQUIRED/, "a signed-out caller is turned away first");
});

test("a refused tester is told their own account id, and nothing else is", () => {
  // The allowlist is a list of account ids, and the owner had no dependable
  // place to read his: the same email has a different id in each Supabase
  // project. The readiness check hands back the id of whoever is signed in —
  // to them, uncached — and only where they are refused.
  const route = read("app/api/missions/plan/route.ts");
  const get = route.slice(route.indexOf("export async function GET()"), route.indexOf("export async function POST("));
  const post = route.slice(route.indexOf("export async function POST("));
  assert.match(get, /"AI_ACCESS_RESTRICTED", "[^"]+", \{ accountId: user\.id \}/);
  assert.equal([...get.matchAll(/accountId/g)].length, 1, "the id leaves the server in exactly one place");
  assert.doesNotMatch(post, /accountId/, "the POST has no reason to echo it");
  assert.match(read("lib/ai/gate.ts"), /"Cache-Control": "no-store/);

  const panel = read("components/ai-mission-plan.tsx");
  assert.match(panel, /\/\^\[0-9a-f-\]\{36\}\$\/i\.test\(payload\.accountId\)/, "only a UUID is ever rendered");
  assert.match(panel, /<code dir="ltr">\{accountId\}<\/code>/, "an id reads left to right in an Arabic page too");
});

test("an answer cut off at the token ceiling is named as that, and the ceiling has room", async () => {
  // Measured on the first day of real use: five generations, four of them
  // stopped at exactly 1200 completion tokens and were discarded as "not
  // valid JSON" after being counted. The owner read it as a spent allowance.
  const gate = read("lib/ai/gate.ts");
  assert.match(gate, /DEFAULT_MAX_COMPLETION_TOKENS = 2000;/);
  assert.match(gate, /MAX_COMPLETION_TOKENS_CEILING = 2400;/);
  assert.doesNotMatch(gate, /Math\.min\(1400/);

  const run = read("lib/ai/run.ts");
  const truncated = run.indexOf('finish_reason === "length"');
  assert.ok(truncated > -1, "a truncated answer must be recognised");
  assert.ok(truncated < run.indexOf("JSON.parse(content)"), "and before it is parsed, or it is reported as invalid JSON");
  assert.match(run, /"AI_REPORT_TRUNCATED", messages\.reportTruncated/);
  for (const file of ["app/api/missions/plan/route.ts", "app/api/opportunities/analyze/route.ts"]) {
    assert.match(read(file), /reportTruncated: "The AI answer was cut off/, file);
  }

  const { buildMissionPlanPrompt, MAX_PLAN_STEPS, REQUESTED_PLAN_STEPS } = await import("../lib/mission-plan-ai.mjs");
  const { system } = buildMissionPlanPrompt({ name: "n", intent: "something to do", existingCriteria: [], existingActions: [], language: "ar" });
  assert.match(system, /at most 18 words/);
  assert.ok(REQUESTED_PLAN_STEPS < MAX_PLAN_STEPS, "ask for fewer than is accepted");
  assert.ok(system.includes(`steps 3–${REQUESTED_PLAN_STEPS};`));
});
