import assert from "node:assert/strict";
import test from "node:test";
import { requestMissionResearch } from "../lib/ai-research-provider.mjs";
import { runAiGeneration } from "../lib/ai-generation-service.mjs";
import { sendWorkspaceInvitationEmail } from "../lib/workspace-invitation-email.mjs";

const mission = { name: "Research objective", intent: "Find public information only", criteria: ["Cite sources"] };

test("Mission Research sends only after JIT preparation and uses a redirect-blocked fake OpenAI transport", async () => {
  const order = [];
  let providerCalls = 0;
  let providerRequest;
  const outcome = await runAiGeneration({
    requestId: "research-runtime-order-0001",
    reserve: async () => { order.push("quota"); return { allowed: true, reservation_id: "reservation-1" }; },
    prepare: async () => { order.push("execution-and-jit-claim"); },
    generate: async () => requestMissionResearch(mission, {
      apiKey: "test-only-key",
      model: "test-model",
      requestId: "research-runtime-order-0001",
      fetchImpl: async (url, init) => {
        providerCalls += 1;
        providerRequest = { url, init };
        order.push("provider");
        return new Response(JSON.stringify({
          status: "completed",
          output_text: "Bounded findings.",
          output: [{ action: { sources: [{ title: "Example", url: "https://example.test/source" }] } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    }),
    consume: async () => { order.push("consume"); },
    release: async () => { order.push("release"); },
  });

  assert.equal(outcome.kind, "success");
  assert.deepEqual(order, ["quota", "execution-and-jit-claim", "provider", "consume"]);
  assert.equal(providerCalls, 1);
  assert.equal(providerRequest.url, "https://api.openai.com/v1/responses");
  assert.equal(providerRequest.init.redirect, "error");
  assert.equal(providerRequest.init.cache, "no-store");
  assert.equal(providerRequest.init.headers.Authorization, "Bearer test-only-key");
  assert.equal(providerRequest.init.headers["X-Client-Request-Id"], "research-runtime-order-0001");
  const body = JSON.parse(providerRequest.init.body);
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, [{ type: "web_search", search_context_size: "medium" }]);
  assert.equal(body.tool_choice, "required");
  assert.deepEqual(JSON.parse(body.input), mission);
  assert.deepEqual(outcome.plan.sources, [{ title: "Example", url: "https://example.test/source" }]);
});

test("Research authorization denial or uncertainty never reaches the OpenAI transport", async () => {
  for (const [errorCode, expectedKind, shouldRelease] of [
    ["AGENT_RESEARCH_JIT_CLAIM_DENIED", "provider_error", true],
    ["AGENT_RESEARCH_JIT_CLAIM_UNCONFIRMED", "provider_error", false],
  ]) {
    let providerCalls = 0;
    let releases = 0;
    const outcome = await runAiGeneration({
      requestId: `research-${errorCode.toLowerCase()}-0001`,
      reserve: async () => ({ allowed: true, reservation_id: "reservation-2" }),
      prepare: async () => { throw new Error(errorCode); },
      generate: async () => {
        providerCalls += 1;
        return requestMissionResearch(mission, { apiKey: "test-only", fetchImpl: async () => new Response("{}") });
      },
      consume: async () => {},
      release: async () => { releases += 1; },
    });
    assert.equal(outcome.kind, expectedKind);
    assert.equal(providerCalls, 0, `${errorCode} must block the OpenAI call`);
    assert.equal(releases, shouldRelease ? 1 : 0);
  }
});

test("OpenAI redirect and provider failures fail closed without exposing response bodies", async () => {
  await assert.rejects(requestMissionResearch(mission, {
    apiKey: "test-only",
    fetchImpl: async (_url, init) => {
      assert.equal(init.redirect, "error");
      return new Response("private provider detail", { status: 302, headers: { location: "https://attacker.test/" } });
    },
  }), /UPSTREAM_REJECTED/);

  await assert.rejects(requestMissionResearch(mission, {
    apiKey: "test-only",
    fetchImpl: async () => new Response("sensitive upstream body", { status: 500 }),
  }), /UPSTREAM_OUTCOME_UNKNOWN/);
});

test("Business invitation Resend call has a stable idempotency key and rejects redirects", async () => {
  let request;
  const result = await sendWorkspaceInvitationEmail({
    email: "owner+<test>@example.test",
    role: "member",
    inviteUrl: "https://zavqera.example/invite/token?x=\"unsafe\"",
    expiresAt: "2026-10-21T12:00:00.000Z",
    idempotencyKey: "workspace-invitation/invite-123",
  }, {
    apiKey: "test-only-resend-key",
    from: "ZAVQERA <invite@example.test>",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response("", { status: 200 });
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.headers["Idempotency-Key"], "workspace-invitation/invite-123");
  const body = JSON.parse(request.init.body);
  assert.equal(body.to[0], "owner+<test>@example.test");
  assert.match(body.html, /owner\+&lt;test&gt;@example\.test/);
  assert.match(body.html, /x=&quot;unsafe&quot;/);
  assert.equal(request.init.headers.Authorization, "Bearer test-only-resend-key");
});

test("Resend rejection is definite; transport timeout stays ambiguous for invitation recovery", async () => {
  const rejected = await sendWorkspaceInvitationEmail({
    email: "member@example.test", role: "viewer", inviteUrl: "https://zavqera.example/i/t",
    expiresAt: "2026-10-21T12:00:00.000Z", idempotencyKey: "workspace-invitation/rejected",
  }, { apiKey: "test", from: "invite@example.test", fetchImpl: async () => new Response("private", { status: 422 }) });
  assert.deepEqual(rejected, { ok: false, reason: "EMAIL_PROVIDER_REJECTED" });

  await assert.rejects(sendWorkspaceInvitationEmail({
    email: "member@example.test", role: "viewer", inviteUrl: "https://zavqera.example/i/t",
    expiresAt: "2026-10-21T12:00:00.000Z", idempotencyKey: "workspace-invitation/ambiguous",
  }, { apiKey: "test", from: "invite@example.test", fetchImpl: async () => { throw new Error("simulated timeout"); } }), /simulated timeout/);
});
