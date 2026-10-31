from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
PRODUCT_BRANCH = "codex/anonymous-ai-rpc-public-invoker-wrapper-20261019"
VALIDATION_BRANCH = "zavqera/anonymous-ai-rpc-wrapper-validation-20261019"
PRODUCT_BASE = "zavqera/ai-planner-integration"


def event_section(workflow: str, event: str) -> str:
    lines = workflow.splitlines()
    start = next(
        (index for index, line in enumerate(lines) if line == f"  {event}:"),
        None,
    )
    if start is None:
        raise AssertionError(f"missing top-level {event} event")
    end = next(
        (
            index
            for index in range(start + 1, len(lines))
            if lines[index] and not lines[index][0].isspace()
        ),
        len(lines),
    )
    return "\n".join(lines[start + 1 : end])


class W83WorkflowPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.flutter = (ROOT / ".github/workflows/flutter.yml").read_text(encoding="utf-8")
        cls.w83 = (
            ROOT
            / ".github/workflows/zavqera-w83-anonymous-ai-rpc-isolated-pgtap.yml"
        ).read_text(encoding="utf-8")
        cls.w85_migration = (
            ROOT
            / "supabase/migrations/20261031193000_w85_anonymous_ai_quota_rls_deny_by_default.sql"
        ).read_text(encoding="utf-8")
        cls.w85_test = (
            ROOT
            / "supabase/tests/w85_anonymous_ai_quota_rls_deny_by_default.sql"
        ).read_text(encoding="utf-8")

    def test_only_candidate_branch_is_ignored_for_flutter_push(self):
        push = event_section(self.flutter, "push")
        pull_request = event_section(self.flutter, "pull_request")

        self.assertRegex(push, r"(?m)^    branches-ignore:\s*$")
        ignored = re.findall(r"(?m)^      - (.+?)\s*$", push)
        self.assertEqual(ignored, [PRODUCT_BRANCH])
        self.assertIn("pull_request:", self.flutter)
        self.assertIn("verify:", self.flutter)
        self.assertIn("./tool/verify_project.sh", self.flutter)
        self.assertNotIn(PRODUCT_BRANCH, pull_request)

    def test_other_flutter_push_branches_keep_default_trigger(self):
        push = event_section(self.flutter, "push")
        self.assertIn(PRODUCT_BRANCH, push)
        self.assertNotIn("branches:", push)

    def test_w83_candidate_push_is_suppressed_but_validation_push_remains(self):
        push = event_section(self.w83, "push")
        branches = re.search(
            r"(?ms)^    branches:\s*\n(.*?)(?=^    \S|\Z)",
            push,
        )
        self.assertIsNotNone(branches)
        allowed = re.findall(r"(?m)^      - (.+?)\s*$", branches.group(1))
        self.assertEqual(allowed, [VALIDATION_BRANCH])
        self.assertNotIn(PRODUCT_BRANCH, push)

    def test_full_pr_validation_and_manual_trigger_remain_available(self):
        pull_request = event_section(self.w83, "pull_request")
        self.assertIn(PRODUCT_BASE, pull_request)
        self.assertIn("workflow_dispatch:", self.w83)
        self.assertIn("w83-pgtap:", self.w83)
        self.assertIn("python3 -m unittest tests/test_w83_workflow_policy.py -v", self.w83)
        self.assertIn("supabase test db --local", self.w83)
        self.assertIn("${GITHUB_WORKSPACE}/supabase/tests/w83_anonymous_ai_rpc_public_invoker_wrappers.sql", self.w83)

    def test_w83_and_w85_tap_parsers_use_their_own_log_files(self):
        w83_start = self.w83.index("Run W83 pgTAP at its dependency point")
        w85_start = self.w83.index("Verify W85 deny-by-default", w83_start)
        cleanup_start = self.w83.index("Stop and prove disposable resource cleanup", w85_start)
        w83_step = self.w83[w83_start:w85_start]
        w85_step = self.w83[w85_start:cleanup_start]
        self.assertIn('Tests=[0-9]+', w83_step)
        self.assertIn('"${log}"', w83_step)
        self.assertNotIn('"${tap_log}"', w83_step)
        self.assertIn('Tests=[0-9]+', w85_step)
        self.assertIn('"${tap_log}"', w85_step)
        self.assertIn("All tests successful[.]$", w85_step)
        self.assertGreaterEqual(w83_step.count("|| true"), 3)
        self.assertGreaterEqual(w85_step.count("|| true"), 3)
        self.assertIn("20261031193000_w85_anonymous_ai_quota_rls_deny_by_default.sql", self.w83)
        self.assertIn("w85_anonymous_ai_quota_rls_deny_by_default.sql", self.w83)
        self.assertIn("supabase test db --local", self.w83)
        self.assertIn("w85_pgtap_assertions_expected", self.w83)
        self.assertIn("grep -oE 'Tests=[0-9]+'", self.w83)
        self.assertIn("grep -oE 'Failed [0-9]+/[0-9]+ subtests'", self.w83)
        self.assertIn("All tests successful", self.w83)
        self.assertIn("w85_postgrest_after_rls=PASS", self.w83)
        self.assertIn("W85_PGTAP_OUTPUT.txt", self.w83)
        self.assertIn("W85_REST_SMOKE.txt", self.w83)
        self.assertNotIn("sed -nE 's/.*Tests=", w85_step)

    def test_w85_migration_enables_rls_without_adding_permissive_policies(self):
        migration = self.w85_migration.lower()
        for table in (
            "anonymous_ai_visitors",
            "anonymous_ai_ip_windows",
            "anonymous_ai_reservations",
        ):
            self.assertIn(f"alter table private.{table} enable row level security", migration)
            self.assertIn(
                f"revoke all privileges on table private.{table}",
                migration,
            )
        self.assertNotIn("create policy", migration)
        self.assertIn("service_role", migration)

    def test_w85_pgtap_plan_matches_assertions_and_checks_rpc_continuity(self):
        plan = re.search(r"(?im)^\s*select\s+plan\((\d+)\)\s*;", self.w85_test)
        self.assertIsNotNone(plan)
        assertion_count = len(
            re.findall(r"(?im)^\s*select\s+(?:ok|is)\s*\(", self.w85_test)
        )
        self.assertEqual(int(plan.group(1)), assertion_count)
        self.assertEqual(int(plan.group(1)), 10)
        self.assertIn("not exists", self.w85_test.lower())
        self.assertIn("has_table_privilege", self.w85_test)
        self.assertIn("has_schema_privilege('service_role', 'private', 'USAGE')", self.w85_test)
        self.assertIn("has_function_privilege('service_role'", self.w85_test)
        self.assertIn("call_rpc reserve_anonymous_ai_generation", self.w83)
        self.assertIn("call_rpc release_anonymous_ai_generation", self.w83)
        self.assertIn("call_rpc consume_anonymous_ai_generation", self.w83)
        self.assertIn("w85_postgrest_after_rls=PASS", self.w83)

    def test_pgtap_assertion_guard_tracks_the_test_file_plan(self):
        test_sql = (
            ROOT / "supabase/tests/w83_anonymous_ai_rpc_public_invoker_wrappers.sql"
        ).read_text(encoding="utf-8")
        plan = re.search(r"(?im)^\s*select\s+plan\((\d+)\)\s*;", test_sql)
        self.assertIsNotNone(plan)
        assertion_count = len(
            re.findall(r"(?im)^\s*select\s+(?:ok|is)\s*\(", test_sql)
        )
        self.assertEqual(int(plan.group(1)), assertion_count)
        self.assertIn('echo "expected_w83_pgtap_assertions=${expected}"', self.w83)
        self.assertIn('[ "${reported}" != "${expected}" ]', self.w83)
        self.assertNotRegex(self.w83, r"(?:planned|reported)\"?\s*\]?\s*!=\s*28")


if __name__ == "__main__":
    unittest.main()

    def test_w85_rls_migration_is_replayed_and_tested_in_the_disposable_postgres_stack(self):
        self.assertIn("20261031193000_w85_anonymous_ai_quota_rls_deny_by_default.sql", self.w83)
        self.assertIn("w85_anonymous_ai_quota_rls_deny_by_default.sql", self.w83)
        self.assertIn("supabase test db --local", self.w83)
        self.assertIn("w85_pgtap_assertions_expected", self.w83)
        self.assertIn("grep -oE 'Tests=[0-9]+'", self.w83)
        self.assertIn("grep -oE 'Failed [0-9]+/[0-9]+ subtests'", self.w83)
        self.assertIn("All tests successful", self.w83)
        self.assertIn("w85_postgrest_after_rls=PASS", self.w83)
        self.assertIn("W85_PGTAP_OUTPUT.txt", self.w83)
        self.assertIn("W85_REST_SMOKE.txt", self.w83)

    def test_w85_migration_enables_rls_without_adding_permissive_policies(self):
        migration = self.w85_migration.lower()
        for table in (
            "anonymous_ai_visitors",
            "anonymous_ai_ip_windows",
            "anonymous_ai_reservations",
        ):
            self.assertIn(f"alter table private.{table} enable row level security", migration)
            self.assertIn(
                f"revoke all privileges on table private.{table}",
                migration,
            )
        self.assertNotIn("create policy", migration)
        self.assertIn("service_role", migration)

    def test_w85_pgtap_plan_matches_assertions_and_checks_rpc_continuity(self):
        plan = re.search(r"(?im)^\s*select\s+plan\((\d+)\)\s*;", self.w85_test)
        self.assertIsNotNone(plan)
        assertion_count = len(
            re.findall(r"(?im)^\s*select\s+(?:ok|is)\s*\(", self.w85_test)
        )
        self.assertEqual(int(plan.group(1)), assertion_count)
        self.assertEqual(int(plan.group(1)), 10)
        self.assertIn("not exists", self.w85_test.lower())
        self.assertIn("has_table_privilege", self.w85_test)
        self.assertIn("has_schema_privilege('service_role', 'private', 'USAGE')", self.w85_test)
        self.assertIn("has_function_privilege('service_role'", self.w85_test)
        self.assertIn("call_rpc reserve_anonymous_ai_generation", self.w83)
        self.assertIn("call_rpc release_anonymous_ai_generation", self.w83)
        self.assertIn("call_rpc consume_anonymous_ai_generation", self.w83)
        self.assertIn("w85_postgrest_after_rls=PASS", self.w83)

    def test_pgtap_assertion_guard_tracks_the_test_file_plan(self):
        test_sql = (
            ROOT / "supabase/tests/w83_anonymous_ai_rpc_public_invoker_wrappers.sql"
        ).read_text(encoding="utf-8")
        plan = re.search(r"(?im)^\s*select\s+plan\((\d+)\)\s*;", test_sql)
        self.assertIsNotNone(plan)
        assertion_count = len(
            re.findall(r"(?im)^\s*select\s+(?:ok|is)\s*\(", test_sql)
        )
        self.assertEqual(int(plan.group(1)), assertion_count)
        self.assertIn('echo "expected_w83_pgtap_assertions=${expected}"', self.w83)
        self.assertIn('[ "${reported}" != "${expected}" ]', self.w83)
        self.assertNotRegex(self.w83, r"(?:planned|reported)\"?\s*\]?\s*!=\s*28")


if __name__ == "__main__":
    unittest.main()
