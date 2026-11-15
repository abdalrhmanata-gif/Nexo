import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { AUTH_ERROR_FALLBACK, AUTH_ERROR_MESSAGES, authErrorMessage } from "../lib/auth-errors.mjs";
import { LANGUAGES, readDictionaries } from "./helpers/dictionaries.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a known provider code gets our sentence, not the provider's", () => {
  const provider = { code: "invalid_credentials", message: "Invalid login credentials" };
  assert.equal(authErrorMessage(provider), "The email or password is not correct.");
  assert.notEqual(authErrorMessage(provider), provider.message);
});

test("an unknown or malformed error gets the fallback, never the raw message", () => {
  const raw = "Database error querying schema: relation auth.identities does not exist";
  for (const error of [{ code: "something_new", message: raw }, { message: raw }, new Error(raw), null, undefined, "text"]) {
    assert.equal(authErrorMessage(error), AUTH_ERROR_FALLBACK);
  }
  // A code that happens to be an Object.prototype key must not resolve.
  assert.equal(authErrorMessage({ code: "toString" }), AUTH_ERROR_FALLBACK);
});

test("every sentence the form can show is translated into all five languages", () => {
  const tables = readDictionaries();
  const missing = [];
  for (const sentence of new Set([...Object.values(AUTH_ERROR_MESSAGES), AUTH_ERROR_FALLBACK])) {
    const absent = LANGUAGES.filter((name) => !tables[name].has(sentence));
    if (absent.length) missing.push(`"${sentence}" is missing from ${absent.join(", ")}`);
  }
  assert.deepEqual(missing, []);
});

test("the sign-in form no longer shows a provider's own message", () => {
  const form = readFileSync(join(webRoot, "components/auth-form.tsx"), "utf8");
  assert.doesNotMatch(form, /setError\([^)]*\.message\)/, "a provider message is being shown as written");
  assert.match(form, /setError\(authErrorMessage\(result\.error\)\)/);
});

test("choosing the same password again says so, instead of blaming the reset link", async () => {
  // Seen on production 2026-11-15: the reset link worked, the person typed
  // their current password, and the form told them to request a new link.
  const { PASSWORD_UPDATE_FALLBACK, passwordUpdateErrorMessage } = await import("../lib/auth-errors.mjs");
  assert.equal(passwordUpdateErrorMessage({ code: "same_password", message: "New password should be different from the old password." }),
    "Choose a password that is different from your current one.");
  assert.equal(passwordUpdateErrorMessage({ code: "weak_password" }), "Password must be at least 8 characters.");
  for (const error of [{ code: "session_not_found" }, { message: "Auth session missing!" }, null]) {
    assert.equal(passwordUpdateErrorMessage(error), PASSWORD_UPDATE_FALLBACK);
  }
  assert.equal(PASSWORD_UPDATE_FALLBACK, "We couldn't update your password. Request a new reset link and try again.");
  const tables = readDictionaries();
  for (const name of LANGUAGES) {
    assert.ok(tables[name].has("Choose a password that is different from your current one."), name);
  }
  const form = readFileSync(join(webRoot, "components", "auth-form.tsx"), "utf8");
  assert.match(form, /if \(updateError\) return setError\(passwordUpdateErrorMessage\(updateError\)\);/);
});
