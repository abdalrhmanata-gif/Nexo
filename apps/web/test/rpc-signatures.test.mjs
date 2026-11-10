import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { GENERATION_KINDS, requestHashFor } from "../lib/ai/request-identity.mjs";

// Does the application call each database function with the arguments the
// database declares?
//
// Nothing checked. A migration replaced reserve_ai_generation(text) with a
// three-argument function and dropped the old one; the application went on
// sending one argument. TypeScript cannot see it — rpc() takes a name and an
// object — and no test exercised it, so every AI generation on a database
// built from the migrations would have stopped at "usage could not be
// verified". It was found by reading the live function's signature, on the
// day the feature was first switched on.
//
// This reads both sides from source: the last definition of each function in
// supabase/migrations, and every rpc("name", { … }) in the application.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(webRoot, "..", "..", "supabase", "migrations");

/** The text between a "(" at `open` and its matching ")". */
function balanced(body, open) {
  let depth = 0;
  for (let index = open; index < body.length; index += 1) {
    const ch = body[index];
    if (ch === "'") {
      index += 1;
      while (index < body.length && body[index] !== "'") index += 1;
    } else if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return body.slice(open + 1, index);
    }
  }
  return null;
}

/** Split on commas that are not inside parentheses or quotes. */
function topLevelParts(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === "'") {
      const end = text.indexOf("'", index + 1);
      current += text.slice(index, end === -1 ? text.length : end + 1);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    if (ch === "," && depth === 0) { parts.push(current); current = ""; } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** name → { params: [{ name, required }], file } for the last definition of each public function. */
export function declaredFunctions(sqlFiles) {
  const declared = new Map();
  for (const { file, body } of sqlFiles) {
    const sql = body.replace(/--[^\n]*/g, "");
    for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(/gi)) {
      const list = balanced(sql, match.index + match[0].length - 1);
      if (list === null) continue;
      const params = [];
      for (const part of topLevelParts(list)) {
        const words = part.split(/\s+/);
        const mode = /^(in|out|inout|variadic)$/i.test(words[0]) ? words.shift().toLowerCase() : "in";
        if (mode === "out") continue;
        params.push({ name: words[0].toLowerCase(), required: !/\bdefault\b|=/i.test(part) });
      }
      declared.set(match[1].toLowerCase(), { params, file });
    }
  }
  return declared;
}

/** Every rpc("name", { … }) with the keys it sends; `keys` is null when the arguments are not a literal. */
export function rpcCalls(sources) {
  const calls = [];
  for (const { file, body } of sources) {
    for (const match of body.matchAll(/\.rpc\(\s*"([a-z_0-9]+)"\s*(,\s*)?/g)) {
      const after = match.index + match[0].length;
      const line = body.slice(0, match.index).split("\n").length;
      if (!match[2]) { calls.push({ name: match[1], keys: [], at: `${file}:${line}` }); continue; }
      if (body[after] !== "{") { calls.push({ name: match[1], keys: null, at: `${file}:${line}` }); continue; }
      let depth = 0;
      let end = after;
      for (; end < body.length; end += 1) {
        if (body[end] === "{") depth += 1;
        else if (body[end] === "}") { depth -= 1; if (depth === 0) break; }
      }
      const keys = topLevelParts(body.slice(after + 1, end))
        .map((part) => /^([A-Za-z_][A-Za-z_0-9]*)\s*(?::|$)/.exec(part)?.[1])
        .filter(Boolean);
      calls.push({ name: match[1], keys, at: `${file}:${line}` });
    }
  }
  return calls;
}

/** What is wrong with each call, in words; empty when every call fits. */
export function mismatches(calls, declared) {
  const problems = [];
  for (const call of calls) {
    const fn = declared.get(call.name);
    if (!fn) { problems.push(`${call.at}  ${call.name} is not created by any migration`); continue; }
    if (call.keys === null) continue;
    const known = new Set(fn.params.map((param) => param.name));
    const sent = new Set(call.keys);
    const missing = fn.params.filter((param) => param.required && !sent.has(param.name)).map((param) => param.name);
    const unknown = call.keys.filter((key) => !known.has(key));
    if (missing.length) problems.push(`${call.at}  ${call.name} is called without ${missing.join(", ")} (declared in ${fn.file})`);
    if (unknown.length) problems.push(`${call.at}  ${call.name} is sent ${unknown.join(", ")}, which it does not declare (see ${fn.file})`);
  }
  return problems;
}

function migrations() {
  return readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()
    .map((name) => ({ file: `supabase/migrations/${name}`, body: readFileSync(join(migrationsDir, name), "utf8") }));
}

function applicationSources() {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  return ["app", "components", "lib"].flatMap((dir) => walk(join(webRoot, dir)))
    .filter((file) => /\.(ts|tsx|mjs)$/.test(file))
    .map((file) => ({ file: relative(webRoot, file), body: readFileSync(file, "utf8") }));
}

test("every database function the application calls is called with the arguments it declares", () => {
  const declared = declaredFunctions(migrations());
  const calls = rpcCalls(applicationSources());
  // A reader that stops matching finds nothing and passes while checking nothing.
  assert.ok(declared.size >= 30, `expected the migrations' functions, found ${declared.size}`);
  assert.ok(calls.length >= 11, `expected the application's rpc calls, found ${calls.length}`);
  assert.ok(calls.filter((call) => call.keys !== null).length >= 10, "almost every call should be a literal this can read");
  assert.deepEqual(mismatches(calls, declared), []);
});

test("the audit catches the drift it was written for", () => {
  const declared = declaredFunctions([
    { file: "001.sql", body: "create function public.reserve_ai_generation(p_request_id text) returns table (allowed boolean) language sql as $$ select true $$;" },
    { file: "002.sql", body: [
      "-- a later migration replaces it",
      "drop function public.reserve_ai_generation(text);",
      "create or replace function public.reserve_ai_generation(",
      "  p_request_id text,",
      "  p_generation_kind text,",
      "  p_request_hash text",
      ") returns table (allowed boolean, reason text) language sql as $$ select true, 'x' $$;",
      "create function public.transition(p_id uuid, p_note text default null, p_score numeric(5,2) default 0) returns void language sql as $$ select $$;",
    ].join("\n") },
  ]);
  assert.deepEqual(declared.get("reserve_ai_generation").params.map((p) => p.name),
    ["p_request_id", "p_generation_kind", "p_request_hash"], "the last definition wins");
  assert.deepEqual(declared.get("transition").params.map((p) => [p.name, p.required]),
    [["p_id", true], ["p_note", false], ["p_score", false]], "a default with a comma in its type is still one parameter");

  const calls = rpcCalls([{ file: "run.ts", body: [
    'await supabase.rpc("reserve_ai_generation", { p_request_id: requestId });',
    'await supabase.rpc("transition", { p_id: id, p_extra: { nested: 1, p_fake: 2 } });',
    'await supabase.rpc("transition", args);',
    'await supabase.rpc("gone");',
  ].join("\n") }]);
  assert.deepEqual(mismatches(calls, declared), [
    "run.ts:1  reserve_ai_generation is called without p_generation_kind, p_request_hash (declared in 002.sql)",
    "run.ts:2  transition is sent p_extra, which it does not declare (see 002.sql)",
    "run.ts:4  gone is not created by any migration",
  ]);
});

test("a request hash is what the database's check accepts, and identifies the request", () => {
  const base = { kind: "planner", model: "m", system: "s", user: "u" };
  const hash = requestHashFor(base);
  assert.match(hash, /^[0-9a-f]{64}$/, "the column's check constraint is exactly this pattern");
  assert.equal(requestHashFor({ ...base }), hash, "the same request has the same identity");
  for (const change of [{ kind: "research" }, { model: "m2" }, { system: "s2" }, { user: "u2" }]) {
    assert.notEqual(requestHashFor({ ...base, ...change }), hash, JSON.stringify(change));
  }
  // Parts are length-prefixed: moving a character across a boundary is a different request.
  assert.notEqual(requestHashFor({ ...base, system: "ab", user: "c" }), requestHashFor({ ...base, system: "a", user: "bc" }));
  assert.throws(() => requestHashFor({ ...base, kind: "other" }), TypeError);
  assert.throws(() => requestHashFor({ ...base, user: undefined }), TypeError);
});

test("the kinds the application sends are the kinds the database accepts", () => {
  const sql = migrations().map((m) => m.body).join("\n");
  const check = [...sql.matchAll(/p_generation_kind not in \(([^)]*)\)/g)].pop();
  assert.ok(check, "the generation-kind check has moved; update this test");
  const accepted = [...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual([...GENERATION_KINDS].sort(), accepted);
  assert.match(readFileSync(join(webRoot, "app/api/missions/plan/route.ts"), "utf8"), /generationKind: "planner"/);
  assert.match(readFileSync(join(webRoot, "app/api/opportunities/analyze/route.ts"), "utf8"), /generationKind: "research"/);
});
