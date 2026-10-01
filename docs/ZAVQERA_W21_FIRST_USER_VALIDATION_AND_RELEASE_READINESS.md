# W21 - First-user validation and release readiness

Authority: owner's official W21 scope, 2026-10-01.
Baseline: `df77804c828364c3987d98832641b203286b1aec`.
Branch: `zavqera/alternative-web-deployment`.
Status: specification and evidence audit complete; validation/release gate BLOCKED
by missing detailed observations and current authenticated loop evidence.

## 1. Objective

Validate the existing promise: **turn an intention into steps, follow through,
and reach an outcome**. Identify the highest-severity repeated friction and make
only the smallest evidence-backed change required for release readiness.

## 2. Scope

Use [the first-user validation plan](ZAVQERA_FIRST_USER_VALIDATION_PLAN.md)
as the protocol source of truth, supported by the execution kit and evidence
template. Audit existing evidence, run the existing web regression gate, and
record release-readiness evidence with explicit provenance.

Preserve the boundaries in BACKEND_ARCHITECTURE.md, WEB_ARCHITECTURE.md,
WEB_API_CONTRACT.md, AUTH_SESSION_MODEL.md and DATA_MODEL_CONTRACT.md:
server-derived identity/ownership, authorized data access, authoritative
lifecycle mutations, and separate intent, actions, evidence and outcomes.
Their historical "future/local mock" descriptions are not current deployment
evidence; do not implement their example APIs as new W21 functionality.

## 3. Out of scope

No AI features, autonomous execution, notifications, collaboration, payments,
search, external integrations, new backend architecture or speculative
expansion. No new capability is justified unless supported by observed repeated
user evidence. Evidence alone does not authorize expanding this milestone.
No application, API, database or test changes are currently justified by the
user-friction audit.

## 4. Test protocol

Recruit 5-10 real people managing meaningful obligations using notes, calendars,
email or task applications. Include administrative, professional follow-up,
multi-step and postponed personal work. Obtain consent before recording.
Use anonymized participant IDs and real goals without confidential details.

Use the existing branch URL, never the site's main deployment:
https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app

Record the actual ready deployment ID and commit before each round. Use only
ZAVQERA Development (`mrwmmbytcymqgwvcoywd`) and participant-authorized accounts.
The source plan's "local-first" setup is historical; its tasks and measurement
rules remain unchanged on the current authenticated MVP.

Give only one of the source plan's scenario titles:
renew my passport; follow up with a potential business partner; open a small
business; complete an important personal project. Participants define the steps.

Read the source task verbatim, without demonstrating or supplying example steps:

> Create a mission for this goal. Add the steps you think are needed, in the
> order you would do them. Save it. Tell me what you would do next. Mark one
> step In Progress, then Waiting, and set a follow-up date. Leave the mission
> and return later. Record what happened, complete a step, return to the
> workspace, and explain what still needs attention.

If blocked, ask "What would you try next?" Record the blocker before giving
minimal assistance. Mark every intervention. Do not count prompted behavior as
unprompted success. Schedule a real return and record both visits; an immediate
reload alone does not establish return-later behavior or retention.

Record all observation points in plan section 5, including find/save times,
goal/steps hesitation, next action, Waiting/follow-up meanings, outcome discovery,
progress interpretation, attention after return, reopening, and product framing.
Use unprompted / prompted / blocked labels.

Ask the ten interview questions from plan section 6 in their exact order:

1. What do you think ZAVQERA is for?
2. What would you use it for tomorrow?
3. What did Waiting mean to you?
4. When would you expect to use the follow-up date?
5. When you returned, did you immediately know what needed attention?
6. What, if anything, would you normally use instead?
7. Would you use ZAVQERA again for a real obligation? Why or why not?
8. What did you expect to happen that did not happen?
9. What capability did you want but could not find?
10. Which part would you use repeatedly?

Capture the natural product description before explaining the promise.
Use ZAVQERA_FIRST_USER_VALIDATION_EVIDENCE_TEMPLATE.md to record observations,
not retrospective invented answers. Record unavailable timestamps as missing.

### Separate technical loop check

An authorized tester must record create mission -> define meaningful actions ->
save -> identify next action -> lifecycle -> Waiting -> follow-up -> leave ->
return -> identify attention -> finish work -> verification -> outcome ->
mission completion. Capture reload persistence and server-accepted state, not
just clicked controls. This does not count as a human learning session.

Use two disposable Development accounts/fixtures to check ownership separately.
Verify completed + cancelled permits completion, while adding pending work
rejects completion. Preserve verification/lifecycle guards, idempotency and
cancellation history. Use a reviewed transactional SQL fixture check with
rollback for database semantics; do not rerun W20 SQL or repair migration history.

Before any authenticated browser fixture creation, establish a cleanup method
compatible with append-only history. The existing E2E test can leave
provenance-protected missions and is not a guaranteed-cleanup W21 runner.
Do not disable history protection or delete real participant records to make
cleanup pass. Stop if isolated fixture cleanup cannot be guaranteed.

## 5. Required evidence and current audit

Search performed across tracked repository files and docs for T01-T05,
first-user validation, friction, observations, evidence and user sessions.

| Category | Source | What it establishes |
|---|---|---|
| A: inspected artifacts/current checks | Validation plan, execution kit and evidence template | Executable protocol; template contains no completed observations |
| A: inspected artifacts/current checks | W18_USER_LEARNING_ROUND.md | Explicitly records missing session telemetry; not proof of individual behaviors |
| A: inspected artifacts/current checks | W19_PRODUCT_AUDIT.md and FIRST_USER_VALIDATION_FIXES.md | Historical engineering findings, not repeated participant friction |
| A: current checks | W21_RELEASE_READINESS.md | Local checks, migration hash and public deployment observations with limits |
| B: owner-confirmed assertions | W18_USER_LEARNING_ROUND.md | T01-T05: owner-confirmed PASS only |
| B: owner-confirmed assertions | Owner W20 reconciliation handoff, 2026-10-01 | Live W20 guards/behavior passed and fixtures rolled back; not rerun during W21 |
| C: missing | Evidence template and W18 empty detail sections | Quotes, dates/timings, interventions, independent task completion, return observations and friction frequencies |
| C: missing | Current round | Current authenticated full-loop evidence and completed aggregate learning decision |

Do not invent quotes, user behavior, timing, frequency, conversion, retention,
willingness to pay or missing test outputs. A blank register means unknown,
not zero friction. Historical reports are not fresh live verification.

## 6. Success criteria

Apply source plan section 7 without adding scores: useful mission with at least
three meaningful steps; next action identified in under 30 seconds; accurate
Waiting/follow-up explanation; attention recognized after return; progress
understood; outcome recorded unaided; at least half describe follow-through
rather than only a task list. Record actual denominators and missing values.
Voluntary second-mission use and reasons to return are signals, not inferred
retention or commercial demand.

## 7. Failure criteria

Apply source plan section 8: inability to create without example steps,
repeated uncertainty after saving, Waiting mistaken for completion/deletion,
missed follow-up, misunderstood progress, lost context, generic-todo framing,
no desire to return, or requests without use of the existing loop.
Missing evidence blocks validation; it is not a demonstrated product failure.

## 8. Friction register

| Issue | Frequency | Severity | User impact | Evidence / quote | Classification | Possible response |
|---|---|---|---|---|---|---|
| No participant finding available for classification | Unknown | Not assessed | Unknown | No detailed observations supplied | Unclassified | Hold scope; collect observations |

Replace this placeholder only with observed evidence. Count affected testers,
not repeated mentions by one tester. High means blocked task, lost context or
undermined core promise. Classify requested feature, observed problem, repeated
behavior or validated product need. Link each row to anonymized session evidence.

## 9. Decision rule

Follow plan section 10: Continue, Change/narrow, or Hold scope. Only select a
product fix from the highest-frequency High-severity repeated evidence; use one
minimal response and a focused follow-up validation. Do not batch unrelated fixes.

Current decision: **Hold scope; no evidence-backed feature change required.**
Evidence audit is complete; real-user validation is not independently complete.
If a documented completed round finds no repeated High-severity friction, record
"Validation complete / no evidence-backed feature change required." Do not apply
that label to the current missing-observation state.

## 10. Release-readiness checklist

Use [the W21 release checklist](ZAVQERA_W21_RELEASE_READINESS.md). Every check must
state PASS, owner-confirmed, BLOCKED or not applicable with evidence. Local unit
or source-contract tests cannot certify live SQL authorization or human understanding.
W21 release PASS requires the documented product loop and required release checks
to be evidenced; documentation completion alone does not release the product.

## 11. Rollback rule

This W21 change is documentation only: no runtime or schema rollback is needed.
If documentation is wrong, correct/revert only its focused commit on this branch,
without rewriting history. If a future evidence-backed product fix regresses,
stop release, revert that separate fix and revalidate the prior known-good build.
Never roll back W20 by reapplying SQL; any database rollback requires its own
review, target verification and data-preserving plan.

## 12. Capability gate

No new capability is justified without observed repeated user evidence.
No such evidence is currently recorded. W21 adds no capability or product behavior.
Do not begin the next milestone automatically.
