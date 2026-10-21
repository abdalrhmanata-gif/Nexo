import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseAuthorizationHeader } from "../lib/bearer-auth.mjs";
import { createAuthenticatedBearerContext } from "../lib/supabase/bearer-context.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const route = readFileSync(path.join(root, "apps/web/app/api/ai/plan/route.ts"), "utf8");
const anonymousRoute = readFileSync(path.join(root, "apps/web/app/api/ai/plan/anonymous/route.ts"), "utf8");
const deployWorkflow = readFileSync(path.join(root, ".github/workflows/web-deploy-netlify.yml"), "utf8");
const server = readFileSync(path.join(root, "apps/web/lib/supabase/server.ts"), "utf8");
const bearerContextSource = readFileSync(path.join(root, "apps/web/lib/supabase/bearer-context.mjs"), "utf8");
const usage = readFileSync(path.join(root, "apps/web/lib/ai-usage.ts"), "utf8");

test("Netlify preview validation follows the PR and checks unauthenticated AI returns 401", () => {
  assert.ok(deployWorkflow.includes(
    'PREVIEW_URL: https://deploy-preview-${{ github.event.pull_request.number }}--unique-kringle-3ce321.netlify.app',
  ));
  assert.equal(
    deployWorkflow.includes("deploy-preview-29--unique-kringle-3ce321.netlify.app"),
    false,
  );
  assert.ok(deployWorkflow.includes('test "$ai_unauth" = "401"'));
  const livePlanningStart = deployWorkflow.indexOf("- name: Verify real OpenAI mission planning");
  const liveResearchStart = deployWorkflow.indexOf("- name: Check Development-only live research authentication config");
  assert.ok(livePlanningStart >= 0);
  assert.ok(liveResearchStart > livePlanningStart);
  const livePlanningStep = deployWorkflow.slice(livePlanningStart, liveResearchStart);
  assert.ok(livePlanningStep.includes("if: github.event_name == 'pull_request'"));
  assert.ok(livePlanningStep.includes("head.repo.full_name == github.repository"));
  assert.ok(livePlanningStep.includes("contains(github.event.pull_request.body, '[live-openai-planning]')"));
  assert.equal(livePlanningStep.includes("github.event_name != 'pull_request'"), false);
});

test("requests without Authorization retain the cookie-session path", () => {
  assert.deepEqual(parseAuthorizationHeader(null), { kind: "cookie" });
});

test("valid bearer authorization yields only the opaque access token", () => {
  assert.deepEqual(parseAuthorizationHeader("Bearer user.jwt.token"), {
    kind: "bearer",
    token: "user.jwt.token",
  });
  assert.deepEqual(parseAuthorizationHeader("  bEaReR   user.jwt.token  "), {
    kind: "bearer",
    token: "user.jwt.token",
  });
});

test("malformed or non-bearer Authorization never falls back to cookies", () => {
  for (const value of ["", "Basic user.token", "Bearer", "Bearer token extra", "Bearer token\nextra"]) {
    assert.deepEqual(parseAuthorizationHeader(value), { kind: "invalid" }, value);
  }
});

test("bearer context validates the token and returns the exact user-scoped client", async () => {
  const accessToken = "user.jwt.token";
  const user = { id: "auth-user-1" };
  const received = [];
  const supabase = {
    auth: {
      getUser: async (token) => {
        received.push(token);
        return { data: { user }, error: null };
      },
    },
  };
  const calls = [];
  const createClient = (url, key, options) => {
    calls.push({ url, key, options });
    return supabase;
  };

  const context = await createAuthenticatedBearerContext({
    accessToken,
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "publishable-test-key",
    createClient,
  });

  assert.deepEqual(received, [accessToken]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.supabase.co");
  assert.equal(calls[0].key, "publishable-test-key");
  assert.deepEqual(calls[0].options.auth, {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  });
  assert.equal(await calls[0].options.accessToken(), accessToken);
  assert.equal(context.user, user);
  assert.strictEqual(context.supabase, supabase);
});

test("invalid bearer token yields no authenticated context", async () => {
  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: new Error("invalid token"),
      }),
    },
  };
  const context = await createAuthenticatedBearerContext({
    accessToken: "invalid.token",
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "publishable-test-key",
    createClient: () => supabase,
  });
  assert.equal(context, null);
});

test("bearer context fails closed on missing config or empty token", async () => {
  let clientCreated = false;
  const args = {
    accessToken: "token",
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "publishable-test-key",
    createClient: () => {
      clientCreated = true;
      throw new Error("must not create client");
    },
  };
  await assert.rejects(
    createAuthenticatedBearerContext({ ...args, supabaseUrl: undefined }),
    /not configured/,
  );
  await assert.rejects(
    createAuthenticatedBearerContext({ ...args, accessToken: " " }),
    /access token is required/,
  );
  assert.equal(clientCreated, false);
});

test("both AI planning endpoints enforce body size before quota or provider work", () => {
  const authenticatedBodyGate = route.indexOf("readJsonBody(request)");
  const authenticatedGeneration = route.indexOf("runAiGeneration(");
  const anonymousBodyGate = anonymousRoute.indexOf("readJsonBody(request)");
  const anonymousReservation = anonymousRoute.lastIndexOf("await reserveAnonymousAiGeneration(");

  assert.ok(authenticatedBodyGate >= 0);
  assert.ok(authenticatedBodyGate < authenticatedGeneration);
  assert.ok(route.includes('status: parsedBody.reason === "too_large" ? 413 : 400'));
  assert.ok(anonymousBodyGate >= 0);
  assert.ok(anonymousBodyGate < anonymousReservation);
  assert.ok(anonymousRoute.includes('errorResponse("Request body is too large.", 413'));
});

test("bearer route validates the token and reuses its user-scoped client for quota settlement", () => {
  const invalidHeaderGuard = route.indexOf('if (authorization.kind === "invalid")');
  const cookieSessionPath = route.indexOf("user = await getAuthenticatedUser()");
  assert.ok(invalidHeaderGuard >= 0, "malformed authorization must be rejected");
  assert.ok(invalidHeaderGuard < cookieSessionPath, "invalid authorization must not fall back to cookies");
  assert.match(route.slice(invalidHeaderGuard, cookieSessionPath), /status: 401/);
  assert.ok(route.includes("getAuthenticatedBearerContext(authorization.token)"));
  assert.ok(route.includes("reserveAiGeneration("));
  assert.ok(route.includes("quotaSupabaseClient,"));
  assert.ok(route.includes("consumeAiGeneration(reservationId, quotaSupabaseClient)"));
  assert.ok(route.includes("releaseAiGeneration(reservationId, quotaSupabaseClient)"));
  assert.ok(server.includes("createAuthenticatedBearerContext"));
  assert.ok(bearerContextSource.includes("await supabase.auth.getUser(accessToken)"));
  assert.ok(bearerContextSource.includes("accessToken: async () => accessToken"));
  assert.ok(usage.includes("resolveUsageClient(client)"));
});
