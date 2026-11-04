import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HarnessBlockedError,
  assertAppTargetsDisposableStack,
  buildAppEnv,
  checkStaticPreconditions,
  checkToolAvailability,
  createCommandRunner,
  destroyStack,
  isPortFree,
  readLedgerFile,
  runWithGuaranteedCleanup,
  startAppServer,
  startFreshStack,
  stopAppServer,
  waitForApp,
} from "./harness.mjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const repoRoot = path.resolve(webRoot, "..", "..");

/**
 * Order matters: every refusal happens before the first process is started,
 * the stack is destroyed and verified empty before it is started, and the
 * returned teardown always destroys and re-verifies it.
 */
export default async function globalSetup() {
  const verdict = checkStaticPreconditions(process.env, { repoRoot });
  if (!verdict.ok) throw new HarnessBlockedError(verdict.reasons);
  const { plan } = verdict;

  const run = createCommandRunner();
  const toolReasons = checkToolAvailability(run);
  if (toolReasons.length) throw new HarnessBlockedError(toolReasons);
  if (!(await isPortFree(plan.port, new URL(plan.baseURL).hostname.replace(/^\[|\]$/g, "")))) {
    throw new HarnessBlockedError([`Port ${plan.port} is already in use; the harness never reuses an existing server.`]);
  }

  const runId = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const ledgerPath = path.join(os.tmpdir(), "zavqera-e2e", `${runId}-fixture-ledger.json`);
  let app = null;
  let tornDown = false;

  async function teardown() {
    if (tornDown) return;
    tornDown = true;
    await runWithGuaranteedCleanup(
      () => stopAppServer(app),
      () => destroyStack(plan, run),
    );
    const ledger = readLedgerFile(ledgerPath);
    const counts = ledger.entries.reduce((totals, entry) => ({ ...totals, [entry.kind]: (totals[entry.kind] ?? 0) + 1 }), {});
    console.log(JSON.stringify({
      cleanup: "VERIFIED",
      projectId: plan.projectId,
      evidence: "No Docker container or volume carries the disposable project label.",
      destroyedFixtures: counts,
      ledger: ledgerPath,
    }));
  }

  try {
    const target = startFreshStack(plan, run, process.env);
    app = startAppServer({ webRoot, plan, env: buildAppEnv(process.env, target) });
    await waitForApp(plan.baseURL);
    await assertAppTargetsDisposableStack(plan.baseURL);

    process.env.ZAVQERA_E2E_RUNTIME_SUPABASE_URL = target.apiUrl;
    process.env.ZAVQERA_E2E_RUNTIME_PUBLISHABLE_KEY = target.publishableKey;
    process.env.ZAVQERA_E2E_RUNTIME_BASE_URL = plan.baseURL;
    process.env.ZAVQERA_E2E_RUN_ID = runId;
    process.env.ZAVQERA_E2E_LEDGER_PATH = ledgerPath;
  } catch (error) {
    await runWithGuaranteedCleanup(() => { throw error; }, teardown);
  }

  return teardown;
}
