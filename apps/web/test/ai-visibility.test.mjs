import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { FEATURES, PLAN_PRICES_USD, PROFILES, SITE_DESCRIPTION, homeStructuredData, jsonLdScript } from "../lib/site-schema.mjs";
import { HOST, KEY, KEY_LOCATION, changedUrls, pageText, sitemapUrls, submission, textHash } from "../../../tool/indexnow.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const readRoot = (path) => readFileSync(join(repoRoot, path), "utf8");

test("the home page tells engines what ZAVQERA is, with facts only", () => {
  const data = homeStructuredData();
  const [organization, website, software] = data["@graph"];
  assert.equal(data["@context"], "https://schema.org");
  assert.equal(organization["@type"], "Organization");
  assert.equal(organization.url, "https://zavqera.com");
  assert.equal(organization.logo.url, "https://zavqera.com/brand/zavqera-icon-512.png");
  assert.ok(existsSync(join(webRoot, "public/brand/zavqera-icon-512.png")), "the logo is served by the site");
  assert.deepEqual(organization.sameAs, [...PROFILES]);
  assert.deepEqual(PROFILES, [
    "https://www.youtube.com/@ZAVQERA",
    "https://www.g2.com/products/zavqera/reviews",
    "https://www.crunchbase.com/organization/zavqera",
  ], "only profiles the company runs, each checked by the owner");
  assert.equal(website["@type"], "WebSite");
  assert.equal(software["@type"], "SoftwareApplication");
  assert.equal(software.applicationCategory, "BusinessApplication");
  assert.equal(software.description, SITE_DESCRIPTION);
  const text = JSON.stringify(data);
  for (const invented of ["aggregateRating", "ratingValue", "reviewCount", "review\""]) {
    assert.ok(!text.includes(invented), `no ${invented} until real reviews exist`);
  }
  assert.ok(FEATURES.length >= 5);
});

test("the prices engines read are the prices on /pricing", () => {
  const pricing = read("app/pricing/page.tsx");
  for (const [name, monthly] of Object.entries(PLAN_PRICES_USD)) {
    assert.match(pricing, new RegExp(`name: "${name}",\\s*price: "\\$${monthly}",\\s*monthly: ${monthly},`), `${name} costs $${monthly} on /pricing`);
  }
  const offers = homeStructuredData()["@graph"][2].offers;
  assert.deepEqual(offers.map((offer) => [offer.name, offer.price, offer.priceCurrency]), [["Free", "0", "USD"], ["Plus", "19", "USD"], ["Pro", "49", "USD"], ["Scale", "69", "USD"]]);
});

test("the structured data is on the home page and cannot break out of its script tag", () => {
  const home = read("app/page.tsx");
  assert.match(home, /<script type="application\/ld\+json" dangerouslySetInnerHTML=\{\{ __html: jsonLdScript\(homeStructuredData\(\)\) \}\} \/>/);
  assert.equal(jsonLdScript({ a: "</script><b>" }), "{\"a\":\"\\u003c/script>\\u003cb>\"}");
});

test("search results show a description buyers understand, in every language", () => {
  const layout = read("app/layout.tsx");
  assert.ok(layout.includes(`description: t(${JSON.stringify(SITE_DESCRIPTION)})`), "the layout uses the same sentence as the structured data");
  assert.ok(SITE_DESCRIPTION.length <= 160, "short enough to show whole in a result");
  const dictionaries = read("lib/i18n.ts");
  assert.equal(dictionaries.split(`${JSON.stringify(SITE_DESCRIPTION)}:`).length - 1, 5);
});

test("the IndexNow key is served by the site and used by the script", () => {
  assert.match(KEY, /^[a-f0-9]{32}$/);
  assert.equal(readFileSync(join(webRoot, "public", `${KEY}.txt`), "utf8"), KEY, "the key file holds exactly the key");
  assert.equal(KEY_LOCATION, `https://zavqera.com/${KEY}.txt`);
  assert.deepEqual(submission(["https://zavqera.com/a"]), { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: ["https://zavqera.com/a"] });
  assert.equal(submission(Array.from({ length: 10005 }, (_, i) => `https://zavqera.com/${i}`)).urlList.length, 10000);
});

test("IndexNow gets only pages a reader would see as changed", () => {
  const xml = "<urlset><url><loc>https://zavqera.com</loc></url><url><loc> https://zavqera.com/pricing </loc></url><url><loc>https://example.com/x</loc></url></urlset>";
  assert.deepEqual(sitemapUrls(xml), ["https://zavqera.com", "https://zavqera.com/pricing"], "only this site");
  const before = "<html><head><title>Pricing</title><meta name=\"description\" content=\"Plans\"/><script src=\"/_next/static/chunks/a1.js\"></script></head><body><main><h1>Plus &amp; Pro</h1></main><script>self.__next_f.push([1,\"x\"])</script></body></html>";
  const rebuilt = before.replaceAll("a1.js", "b2.js").replace("[1,\"x\"]", "[1,\"y\"]");
  assert.equal(pageText(before), "Pricing Plans Plus & Pro");
  assert.equal(textHash(pageText(before)), textHash(pageText(rebuilt)), "a new build with the same words is not a change");
  assert.notEqual(textHash(pageText(before)), textHash(pageText(before.replace("Plus", "Plus+"))));
  assert.deepEqual(changedUrls({ a: "1", b: "2" }, { a: "1", b: "3", c: "4" }), ["b", "c"]);
});

test("the daily IndexNow job needs no secret and keeps its state between runs", () => {
  const workflow = readRoot(".github/workflows/zavqera-indexnow.yml");
  assert.match(workflow, /schedule:\n\s+- cron: "17 5 \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.ok(!workflow.includes("secrets."), "no secrets");
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /actions\/cache\/restore@v4[\s\S]*node tool\/indexnow\.mjs \.indexnow-state\.json[\s\S]*if: success\(\)[\s\S]*actions\/cache\/save@v4/);
});

test("the MCP Registry listing is valid and points at the live server", () => {
  const listing = JSON.parse(readRoot("server.json"));
  assert.equal(listing.$schema, "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
  assert.match(listing.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  assert.ok(listing.name.startsWith("io.github.abdalrhmanata-gif/"), "the namespace GitHub OIDC can publish to from this repository");
  assert.ok(listing.description.length >= 1 && listing.description.length <= 100, "the registry allows 100 characters");
  assert.ok(listing.title.length <= 100);
  assert.match(listing.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(listing.remotes, [{ type: "streamable-http", url: "https://zavqera.com/mcp" }]);
  assert.equal(listing.icons[0].src, "https://zavqera.com/brand/zavqera-icon-512.png");
  assert.ok(listing.icons[0].src.length <= 255);
  assert.ok(!/plan|price|\$|free trial/i.test(listing.description.replace("Save plans", "Save")), "no selling in the listing");
});

test("publishing to the registry signs in with GitHub OIDC and stores no secret", () => {
  const workflow = readRoot(".github/workflows/zavqera-mcp-registry.yml");
  assert.ok(!workflow.includes("secrets."), "no secrets");
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /releases\/download\/v1\.8\.5\/mcp-publisher_linux_amd64\.tar\.gz/, "a pinned publisher, not whatever is latest");
  assert.match(workflow, /\.\/mcp-publisher login github-oidc/);
  assert.match(workflow, /\.\/mcp-publisher publish/);
  assert.match(workflow, /if \[ "\$status" != "401" \]/, "nothing is published unless the live server answers and asks for sign-in");
});
