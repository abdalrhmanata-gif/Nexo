import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createProductEventHandler } from "../lib/product-events.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

function createEndpoint({ configured = true, user = { id: "signed-in-user" }, authError = null, insertError = null } = {}) {
  const inserted = [];
  let clientFactoryCalls = 0;
  const endpoint = createProductEventHandler({
    isSupabaseConfigured: () => configured,
    createSupabaseServerClient: async () => {
      clientFactoryCalls += 1;
      return {
        auth: { getUser: async () => ({ data: { user }, error: authError }) },
        from: (table) => ({
          insert: async (record) => {
            assert.equal(table, "product_growth_events");
            inserted.push(record);
            return { error: insertError };
          },
        }),
      };
    },
    isValidTemplateId: (id) => id === "family-travel-research",
    jsonResponse: (body, init) => new Response(JSON.stringify(body), init),
  });
  return { endpoint, inserted, get clientFactoryCalls() { return clientFactoryCalls; } };
}

function makeRequest(body) {
  return new Request("https://example.test/api/product-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

test("product growth route uses the injected handler and keeps the authentication boundary server-side", () => {
  const route = read("app/api/product-events/route.ts");
  assert.match(route, /export const POST = createProductEventHandler/);
  assert.match(route, /createSupabaseServerClient/);
  assert.match(route, /isValidTemplateId: \(templateId\) => Boolean\(missionTemplateById\(templateId\)\)/);
  assert.doesNotMatch(route, /service_role/i);
});

test("product growth endpoint validates input and does not write when unconfigured or unauthenticated", async () => {
  const unconfigured = createEndpoint({ configured: false });
  const noConfiguration = await unconfigured.endpoint(makeRequest(JSON.stringify({
    event_type: "template_shared",
    template_id: "family-travel-research",
  })));
  assert.equal(noConfiguration.status, 200);
  assert.deepEqual(await noConfiguration.json(), { recorded: false });
  assert.equal(unconfigured.clientFactoryCalls, 0);

  const malformed = createEndpoint();
  const invalidJson = await malformed.endpoint(makeRequest("{"));
  assert.equal(invalidJson.status, 400);
  assert.deepEqual(await invalidJson.json(), { error: "Invalid event payload." });

  const unsupported = createEndpoint();
  const invalidTemplate = await unsupported.endpoint(makeRequest(JSON.stringify({
    event_type: "template_shared",
    template_id: "not-a-template",
  })));
  assert.equal(invalidTemplate.status, 400);
  assert.deepEqual(await invalidTemplate.json(), { error: "Unsupported product event." });

  const anonymous = createEndpoint({ user: null });
  const unauthenticated = await anonymous.endpoint(makeRequest(JSON.stringify({
    event_type: "template_shared",
    template_id: "family-travel-research",
  })));
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), { error: "Authentication is required." });
  assert.deepEqual(anonymous.inserted, []);
});

test("template-share events use the verified session user and return no-store responses", async () => {
  const { endpoint, inserted } = createEndpoint();
  const response = await endpoint(makeRequest(JSON.stringify({
    event_type: "template_shared",
    template_id: "family-travel-research",
    user_id: "forged-user",
  })));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { recorded: true });
  assert.deepEqual(inserted, [{
    user_id: "signed-in-user",
    event_type: "template_shared",
    template_id: "family-travel-research",
  }]);
});

test("duplicate shares are idempotent and database failures stay explicit", async () => {
  const duplicate = createEndpoint({ insertError: { code: "23505" } });
  const duplicateResponse = await duplicate.endpoint(makeRequest(JSON.stringify({
    event_type: "template_shared",
    template_id: "family-travel-research",
  })));
  assert.equal(duplicateResponse.status, 200);
  assert.deepEqual(await duplicateResponse.json(), { recorded: true, duplicate: true });

  const unavailable = createEndpoint({ insertError: { code: "XX000" } });
  const unavailableResponse = await unavailable.endpoint(makeRequest(JSON.stringify({
    event_type: "template_shared",
    template_id: "family-travel-research",
  })));
  assert.equal(unavailableResponse.status, 503);
  assert.deepEqual(await unavailableResponse.json(), { error: "Product metrics are temporarily unavailable." });
});

test("template share signals are sent only after successful sharing or copying", () => {
  const share = read("components/share-template-button.tsx");
  assert.match(share, /\/api\/product-events/);
  assert.match(share, /recordShare\(\)/);
  assert.match(share, /navigator\.share/);
  assert.match(share, /navigator\.clipboard\.writeText/);
  assert.match(share, /searchParams\.set\("template", templateId\)/);
});

test("repeat-mission measurement is database-triggered and content-minimal", () => {
  const migration = read("../../supabase/migrations/20261010110509_w55_product_growth_signals.sql");
  assert.match(migration, /after insert on public\.missions/);
  assert.match(migration, /owned_mission_count >= 2/);
  assert.match(migration, /second_mission_created/);
  assert.match(migration, /enable row level security/);
  assert.doesNotMatch(migration, /create table[\s\S]*?\b(goal|intent|prompt|email|ip_address)\b/i);
});

test("shared template preview overrides stale anonymous plans without signup", () => {
  const form = read("components/anonymous-plan-form.tsx");
  const page = read("app/try/page.tsx");
  assert.match(form, /const template = missionTemplateById\(templateId\)/);
  assert.match(form, /if \(template\)[\s\S]*setGoal\(template\.goal\)[\s\S]*sessionStorage\.removeItem\(DRAFT_KEY\)/);
  assert.match(page, /No signup needed/);
  assert.match(form, /Create account & save/);
});
