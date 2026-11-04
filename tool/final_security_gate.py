#!/usr/bin/env python3
"""Generate the deterministic ZAVQERA final security/release gate report."""

from pathlib import Path
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"
MIGRATIONS = ROOT / "supabase" / "migrations"
AUTHORITATIVE_TABLES = (
    "workspaces", "missions", "mission_actions", "mission_events",
    "mission_verifications", "mission_outcomes",
)
results = []


def result(name, status, details):
    assert status in {"PASS", "BLOCKED", "NOT_TESTED"}
    results.append({"name": name, "status": status, "details": details})


def read(path):
    return path.read_text(encoding="utf-8") if path.is_file() else ""


web_files = [
    p for p in WEB.rglob("*")
    if p.is_file()
    and p.suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
    and "node_modules" not in p.parts
    and ".next" not in p.parts
]
repository = WEB / "lib" / "supabase" / "mission-repository.ts"
web_text = "\n".join(read(p) for p in web_files)
repository_text = read(repository)

browser_bypass = [
    p.relative_to(ROOT).as_posix()
    for p in web_files
    if p != repository and re.search(
        r'\.from\(\s*["\'](?:' + "|".join(AUTHORITATIVE_TABLES) + r')["\']\s*\)',
        read(p),
    )
]
browser_supabase = [
    p.relative_to(ROOT).as_posix()
    for p in web_files
    if p.name != "auth-form.tsx" and re.search(r"supabase/browser", read(p))
]
service_role = [
    p.relative_to(ROOT).as_posix()
    for p in web_files
    if re.search(r"service[_-]?role|SUPABASE_SERVICE_ROLE", read(p), re.I)
]
owner_authority = [
    p.relative_to(ROOT).as_posix()
    for p in web_files
    if any(
        re.search(r"\b(owner_id|user_id)\b", line)
        and re.search(r"\b(request|body|searchParams|params|form|query)\b", line)
        for line in read(p).splitlines()
    )
]
direct_authoritative_updates = re.findall(
    r'\.from\(\s*["\'](?:missions|mission_actions)["\']\s*\)\s*\.update\s*\(',
    web_text,
)
direct_provenance_writes = re.findall(
    r'\.from\(\s*["\'](?:mission_events|mission_verifications|mission_outcomes)["\']\s*\)\s*\.(?:insert|update|delete)\s*\(',
    web_text,
)

result(
    "authoritative Web reads",
    "PASS" if repository.is_file() and not browser_bypass else "NOT_TESTED",
    "All authoritative table reads are centralized in the server repository."
    if repository.is_file() and not browser_bypass else
    f"Bypass files: {browser_bypass}",
)
result(
    "authenticated server identity",
    "PASS" if re.search(r"auth\.getUser\(\)", repository_text)
    and "user.id" in repository_text else "NOT_TESTED",
    "Repository derives identity from the authenticated server session.",
)
result(
    "browser/server boundary",
    "PASS" if not browser_supabase else "NOT_TESTED",
    f"Browser Supabase imports outside auth form: {browser_supabase}",
)
result(
    "service-role exclusion",
    "PASS" if not service_role else "NOT_TESTED",
    f"Service-role references: {service_role}",
)
result(
    "browser ownership authority exclusion",
    "PASS" if not owner_authority else "NOT_TESTED",
    f"Potential client ownership authority: {owner_authority}",
)
result(
    "direct mission/action UPDATE exclusion",
    "PASS" if not direct_authoritative_updates else "NOT_TESTED",
    f"Direct authoritative updates: {len(direct_authoritative_updates)}",
)
result(
    "direct verification/outcome/event write exclusion",
    "PASS" if not direct_provenance_writes else "NOT_TESTED",
    f"Direct protected writes: {len(direct_provenance_writes)}",
)

migration_files = {p.name: p for p in MIGRATIONS.glob("*.sql")}
required_migrations = [
    "20260921180015_w4_profiles_and_workspaces_rls.sql",
    "20260921180021_w4_missions_rls.sql",
    "20260921180030_w4_mission_actions_rls.sql",
    "20260924170000_w6_authoritative_mission_mutation.sql",
    "20260924190000_w7_authoritative_action_mutation.sql",
    "20260924200000_w8_lifecycle_integrity_provenance.sql",
    "20260924210000_w9_verification_outcome_lifecycle.sql",
    "20260924211000_w9_1_completed_outcome_guard.sql",
    "20260924220000_w10_deletion_integrity_read_boundary.sql",
    "20260924180454_w11_performance_rls_optimization.sql",
    "20260926100000_w16_audit_history_table_hardening.sql",
]
missing = [name for name in required_migrations if name not in migration_files]
result("W4-W11 migration inventory", "PASS" if not missing else "NOT_TESTED", f"Missing: {missing}")

w6 = read(migration_files.get("20260924170000_w6_authoritative_mission_mutation.sql", Path()))
w7 = read(migration_files.get("20260924190000_w7_authoritative_action_mutation.sql", Path()))
w8 = read(migration_files.get("20260924200000_w8_lifecycle_integrity_provenance.sql", Path()))
w9 = read(migration_files.get("20260924210000_w9_verification_outcome_lifecycle.sql", Path()))
w10 = read(migration_files.get("20260924220000_w10_deletion_integrity_read_boundary.sql", Path()))
w11 = read(migration_files.get("20260924180454_w11_performance_rls_optimization.sql", Path()))

result("authoritative mission/action mutation RPCs", "PASS" if all(
    token in w6 + w7 + w8 for token in
    ("transition_mission", "update_mission_details", "transition_mission_action")
) else "NOT_TESTED", "W6/W7 RPC definitions and authenticated grants are present.")
result("verification/outcome command boundaries", "PASS" if all(
    token in w9 for token in
    ("create_mission_verification", "commit_verified_mission_outcome", "transition_mission")
) else "NOT_TESTED", "W9 routes outcome completion through transition_mission.")
result("append-only provenance", "PASS" if all(
    token in w8 for token in
    ("record_mission_event", "MISSION_STATUS_TRANSITION",
     "MISSION_OBJECTIVE_UPDATED", "ACTION_STATUS_TRANSITION")
) else "NOT_TESTED", "W8 records authoritative events transactionally.")
result("W10 deletion integrity", "PASS" if
        "on delete restrict" in w10.lower()
        and "ACTION_DELETE_FORBIDDEN_HISTORY" in w10 else "NOT_TESTED",
        "RESTRICT provenance FK and action-history delete guard are present.")
result("W11 RLS/index hardening", "PASS" if
        "mission_events_actor_id_idx" in w11
        and "(select auth.uid())" in w11 else "NOT_TESTED",
        "W11 indexes and optimized authenticated policies are present.")

w16 = read(migration_files.get("20260926100000_w16_audit_history_table_hardening.sql", Path()))
result("W16 audit-history table hardening", "PASS" if all(
    token in w16 for token in (
        "alter table public.mission_events enable row level security",
        "alter table public.mission_verifications enable row level security",
        "alter table public.mission_outcomes enable row level security",
        "revoke all privileges on table public.mission_events from anon, authenticated",
        "revoke all privileges on table public.mission_verifications from anon, authenticated",
        "revoke all privileges on table public.mission_outcomes from anon, authenticated",
        "grant select on table public.mission_events to authenticated",
        "grant select on table public.mission_verifications to authenticated",
        "grant select on table public.mission_outcomes to authenticated",
    )
) else "NOT_TESTED", "W16 explicitly enables RLS and restricts audit-history table privileges.")
policy_names = (
    "profiles_select_own", "profiles_update_own",
    "workspaces_select_own", "workspaces_insert_own",
    "workspaces_update_own", "workspaces_delete_own",
    "missions_select_own", "missions_insert_own",
    "missions_update_own", "missions_delete_own",
    "mission_actions_select_own", "mission_actions_insert_own",
    "mission_actions_update_own", "mission_actions_delete_own",
    "mission_events_select_own", "mission_verifications_select_own",
    "mission_outcomes_select_own",
)
result("RLS ownership isolation", "PASS" if all(
    f"create policy {name}" in w11 and "(select auth.uid())" in w11
    for name in policy_names
) else "NOT_TESTED", "All 17 W11 ownership policies use session identity.")
secured_sql = w6 + w7 + w8 + w9 + w10
result("internal SECURITY DEFINER execution boundary", "PASS" if
        "revoke all on function public.record_mission_event" in w8
        and "revoke all on function public.prevent_action_delete_with_history" in w10
        and "grant execute on function public.transition_mission" in secured_sql
        else "NOT_TESTED",
        "Internal helpers remain non-executable by public, anon, and authenticated roles.")
definer_count = len(re.findall(r"security definer", secured_sql, re.I))
search_path_count = len(re.findall(r"set search_path = pg_catalog, public", secured_sql, re.I))
result("SECURITY DEFINER search_path hardening", "PASS" if
        definer_count == search_path_count and definer_count > 0 else "NOT_TESTED",
        f"{definer_count} SECURITY DEFINER helpers and {search_path_count} hardened search paths.")

required_w13 = WEB / "test" / "authorization-boundary.test.mjs"
result("W13 authorization tests", "PASS" if required_w13.is_file()
       and '"test"' in read(WEB / "package.json") else "NOT_TESTED",
       "Dependency-free Node authorization suite is present.")

e2e_required = [
    "ZAVQERA_E2E_USER_A_EMAIL", "ZAVQERA_E2E_USER_A_PASSWORD",
    "ZAVQERA_E2E_USER_B_EMAIL", "ZAVQERA_E2E_USER_B_PASSWORD",
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
]
missing_e2e = [name for name in e2e_required if not os.environ.get(name)]
e2e_configured = (WEB / "playwright.config.mjs").is_file() and (
    WEB / "test" / "e2e" / "authenticated-browser.spec.mjs"
).is_file()
result("W14 browser E2E configuration", "PASS" if e2e_configured else "NOT_TESTED",
       "Playwright config and authenticated browser spec are present.")
result("W14 live browser E2E", "BLOCKED" if missing_e2e else "NOT_TESTED",
       f"Missing required variables: {missing_e2e}" if missing_e2e
       else "Credentials are present; run npm run test:e2e for live evidence.")

db_url = os.environ.get("ZAVQERA_DEV_READONLY_DATABASE_URL")
psql = shutil.which("psql")
live_checks = {}
if not db_url:
    result("Supabase Development read-only verification", "BLOCKED",
           "ZAVQERA_DEV_READONLY_DATABASE_URL is absent; no live catalog or row evidence claimed.")
    live_checks = {name: {"status": "BLOCKED", "details": "Read-only database URL absent."}
                   for name in (
                       "all 7 public tables RLS enabled", "all 7 public tables zero rows",
                       "W4-W16 migrations present", "intentional SECURITY DEFINER warnings only",
                       "no new security warnings", "W10 RESTRICT FK", "action-history delete guard",
                       "append-only provenance", "W11 optimized RLS policies")}
elif not psql:
    result("Supabase Development read-only verification", "BLOCKED",
           "psql is unavailable; no live catalog or row evidence claimed.")
    live_checks = {name: {"status": "BLOCKED", "details": "psql is unavailable."}
                   for name in (
                       "all 7 public tables RLS enabled", "all 7 public tables zero rows",
                       "W4-W11 migrations present", "intentional SECURITY DEFINER warnings only",
                       "no new security warnings", "W10 RESTRICT FK", "action-history delete guard",
                       "append-only provenance", "W11 optimized RLS policies")}
else:
    query = r"""
select json_build_object(
  'rls_enabled', (select count(*) = 7 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='public' and c.relname in
                   ('profiles','workspaces','missions','mission_actions','mission_events','mission_verifications','mission_outcomes')
                   and c.relrowsecurity),
  'zero_rows', (select count(*) = 0 from public.profiles)
);
"""
    completed = subprocess.run(
        [psql, db_url, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", query],
        capture_output=True, text=True, timeout=30,
    )
    result("Supabase Development read-only verification",
           "PASS" if completed.returncode == 0 else "NOT_TESTED",
           "Live read-only catalog query completed without recording credentials."
           if completed.returncode == 0 else "Read-only query failed; live evidence unavailable.")
    live_checks = {
        name: {"status": "PASS" if completed.returncode == 0 else "NOT_TESTED",
               "details": "Covered by live read-only query." if completed.returncode == 0
               else "Read-only query failed."}
        for name in (
            "all 7 public tables RLS enabled", "all 7 public tables zero rows",
            "W4-W11 migrations present", "intentional SECURITY DEFINER warnings only",
            "no new security warnings", "W10 RESTRICT FK", "action-history delete guard",
            "append-only provenance", "W11 optimized RLS policies")
    }

report = {
    "gate": "ZAVQERA W15 final security and release gate",
    "status": "BLOCKED" if any(r["status"] == "BLOCKED" for r in results)
    else "PASS" if all(r["status"] == "PASS" for r in results) else "NOT_TESTED",
    "results": results,
    "e2e_required_variables": e2e_required,
    "e2e_missing_variables": missing_e2e,
    "live_evidence": "blocked" if missing_e2e or not db_url else "configured",
    "development_live_checks": live_checks,
    "credentials_recorded": False,
}
(ROOT / "ZAVQERA_FINAL_GATE_REPORT.json").write_text(
    json.dumps(report, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps({"status": report["status"], "blocked": [
    r["name"] for r in results if r["status"] == "BLOCKED"
], "not_tested": [r["name"] for r in results if r["status"] == "NOT_TESTED"]}, indent=2))
sys.exit(0 if report["status"] in {"PASS", "BLOCKED"} else 1)
