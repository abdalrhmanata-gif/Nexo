import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCommandRunner, runPreflight } from "./harness.mjs";

// Read-only gate for `npm run test:e2e`: nothing is started, created or
// destroyed here. Exit code 2 means the run is refused.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const result = await runPreflight(process.env, { repoRoot, run: createCommandRunner() });
const print = result.status === "READY" ? console.log : console.error;
print(JSON.stringify(result, null, 2));
process.exit(result.status === "READY" ? 0 : 2);
