# Production backup and recovery: owner decision pending

2026-10-01. **PLAN ONLY. Neither option selected or executed.**
Development `mrwmmbytcymqgwvcoywd` currently has no provider project backups
on the Free plan. No independent backup or successful restore was verified.
Git and the schema-only E2E snapshot do not back up user data.
Do not export real records under this documentation task.

## Options and recovery objectives

RPO is the maximum acceptable lost-write interval; RTO is the target time to
restore usable service after an incident. Neither is currently guaranteed.

| | Option A: Supabase Pro production project | Option B: Free plan with encrypted off-site exports |
|---|---|---|
| Authorization | Owner approves dedicated target and cost first; no project created here | Owner approves target, operator, storage and export schedule first |
| Mechanism | Managed daily database backups; Pro currently retains 7 days | Owner-run `supabase db dump` roles/schema/data bundle, encrypted before off-site upload |
| Proposed RPO | 24 hours, only while daily backups succeed | 24 hours, only while daily dumps AND off-site delivery succeed |
| Proposed RTO | 8 hours, subject to actual restore drill | 8 hours, subject to retrieval/decryption/auth/data restore drill |
| Schedule | Verify provider's latest completed backup daily at 08:00 UTC | Proposed daily export at 02:00 UTC, receipt check by 03:00 UTC |
| Retention | Provider's 7-day Pro window; no PITR assumed | Proposed 7 daily and 4 weekly encrypted bundles, subject to approved data retention |
| Location | Provider-managed project backup storage | Owner-selected encrypted off-site location in a separate failure domain; exact location UNASSIGNED |
| Additional coverage | Storage objects and external settings/secrets need separate recovery | Storage objects and external settings/secrets need separate recovery |

These are proposed targets/schedules for the owner's chosen option, not an
accepted policy or enabled automation. A missed or unreadable backup invalidates
the claimed RPO; notify the incident owner and record the last usable restore
point. Do not promise an RTO before timing a complete restoration.
PITR, extra retention and paid storage are separate costs, not enabled here.

Backup owner, restore owner and backup reviewer: **UNASSIGNED**; the project
owner must record names and private escalation channels before activation.
Assign primary and cover for absence. Store approval date, selected option,
source project ref, RPO/RTO, schedule and storage location in the private
operations inventory, without passwords or encryption keys.

## Option A activation checklist (owner only)

Approve the dedicated production data boundary and Pro cost; do not reuse
Supabase Main. Verify actual plan/backup availability before accepting data.
Record backup completion, retention and an independently verified restore point.
Schedule a restoration drill in an explicitly authorized isolated target.
Provider restores can cause downtime; never click live Restore as an experiment.
Do not assume physical backups can be downloaded or protect against project
deletion. Managed backup readiness still requires application/auth recovery proof.

## Option B export procedure (owner only)

Install Docker and native Supabase CLI privately. Check `supabase db dump --help`
against the approved version (options checked with 2.119.0). Use the approved
project's Connect panel and existing authorized credentials through the owner's
secret mechanism. Do not reset passwords, use debug logging, paste a connection
string into chat, or store it in scripts/history/CI output.

Templates below deliberately have no credentials. The owner securely supplies
`$OwnerApprovedDbUrl` in memory and creates `$BackupDir` on an access-controlled,
encrypted volume outside every Git checkout and E2E workdir. Do not echo either
credentials or command arguments. Command-line arguments may be visible to local
process inspectors: use a trusted operator host, not a shared shell.

```powershell
if ([string]::IsNullOrWhiteSpace($OwnerApprovedDbUrl) -or
    [string]::IsNullOrWhiteSpace($BackupDir)) {
  throw 'Owner-approved connection and private backup directory required'
}
if (-not (Test-Path -LiteralPath $BackupDir -PathType Container)) {
  throw 'Create and approve the encrypted staging directory first'
}
supabase db dump --db-url $OwnerApprovedDbUrl --role-only -f "$BackupDir\roles.sql"
if ($LASTEXITCODE -ne 0) { throw 'Roles export failed; backup incomplete' }
supabase db dump --db-url $OwnerApprovedDbUrl -f "$BackupDir\schema.sql"
if ($LASTEXITCODE -ne 0) { throw 'Schema export failed; backup incomplete' }
supabase db dump --db-url $OwnerApprovedDbUrl --data-only --use-copy `
  -x 'storage.buckets_vectors' -x 'storage.vector_indexes' -f "$BackupDir\data.sql"
if ($LASTEXITCODE -ne 0) { throw 'Data export failed; backup incomplete' }
```

This follows the current provider logical-backup procedure, not the restricted
public/private **schema-only** E2E dump. Validate included auth/user data privately;
CLI defaults exclude managed schema definitions and some platform internals.
Inventory application-owned auth hooks, grants, RLS, W20/W21 definitions and
sequences. Capture required managed-schema customizations separately through a
reviewed procedure; do not restore platform system tables blindly.

The three commands use separate snapshots. Before a backup involving schema
change, arrange an owner-authorized maintenance window with writes/DDL quiesced,
or a DBA-reviewed consistent-snapshot procedure. Record start/end times and the
consistency method; do not claim a transactional snapshot across commands.
Do not silently stop live writes under this plan.

Inventory exact migration history separately for recovery; its current
repository mismatch is known. No live history repair, insertion, migration
replay or `db push` is authorized. A restored target needs its own reviewed
history reconciliation; never invent missing historical migrations.

Before marking the bundle successful: verify each exit code and file, privately
inspect expected coverage, compute SHA-256 checksums, record source ref,
Postgres/CLI versions and UTC interval, then encrypt the entire bundle and
manifest using an owner-approved authenticated encryption tool. Require strong
encryption at rest and TLS in transit; ZIP compression/password prompts alone
are not encryption evidence. Keep decryption keys in a separate controlled
secret store accessible to the restore owner and approved recovery custodian.

Upload only ciphertext to the approved off-site destination, deny public access,
verify object size/checksum and perform a retrieval/decryption check in a private
temporary location. Remove plaintext only after verified delivery using the
host's approved encrypted-volume lifecycle; deletion on SSD is not proof of
secure erasure. Never commit dumps, hashes of user content, credentials or auth
rows. Keep sanitized backup receipts only. Do not use the E2E fixture stack for
restoring production user records.

## Restore acceptance (both options)

No restore was executed. The restore owner must authorize a non-public isolated
target and maintenance plan. Use the provider's current restore procedure after
reviewing source/target PostgreSQL compatibility, extensions, role privileges
and managed auth customizations. Never restore over Development or Supabase Main
as a test, disable live history guards, or ignore SQL errors to finish faster.

Verify schema, ownership/RLS, pinned search_path/grants, W20/W21 completion
semantics, mission/action/follow-up records, audit/verification/outcome relations,
sequences and expected counts against the backup manifest. Privately prove auth
recovery and owner/cross-user boundaries using approved accounts and a disabled
outbound-email posture. Record start/end, recovery point, errors, achieved RPO/RTO
and pass/fail; destroy only the specifically authorized rehearsal resources.
Prove restoration before public data intake, then propose monthly rehearsals
and repeat after recovery-affecting changes.

Database backups do not include Storage API object bytes, DNS, deploy artifacts,
SMTP/OAuth secrets or custom-role passwords. Inventory and secure those separately
if used. Vault/pgsodium encrypted data also requires a separately protected root
key recovery plan; never export keys to this repository. Auth identity restoration
does not mean old sessions remain valid; document safe sign-in/session handling.

## Sources checked 2026-10-01

- [Supabase backups and plan coverage](https://supabase.com/docs/guides/platform/backups)
- [CLI logical backup/restore and managed-schema caveats](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [PostgreSQL minor-upgrade compatibility notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)

Before a restore/upgrade, review applicable extension/index/custom-operator
changes in that notice. No upgrade or live compatibility scan was performed here.
