import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const layoutPath = fileURLToPath(new URL("../app/app/layout.tsx", import.meta.url));
const layout = await readFile(layoutPath, "utf8");

test("protected app layout requires a verified Supabase user before rendering workspace pages", () => {
  assert.ok(layout.includes('import { getAuthenticatedUser } from "../../lib/supabase/server";'));
  assert.ok(layout.includes('export const dynamic = "force-dynamic";'));
  assert.ok(layout.includes("const user = await getAuthenticatedUser();"));
  assert.ok(layout.includes('if (!user) redirect("/auth/sign-in?next=%2Fapp");'));
  assert.ok(layout.includes("return children;"));
});
