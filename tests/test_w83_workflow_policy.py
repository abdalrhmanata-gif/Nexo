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
