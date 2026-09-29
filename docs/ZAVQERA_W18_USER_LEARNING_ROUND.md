# ZAVQERA W18.7–W18.9 — First structured user learning round

Status: **not started — 0 / 5 sessions.** This document is the protocol and the
empty recording instrument. It contains no findings, because no session has been
run. Nothing below may be filled in from assumption.

## Precondition

Do not start until the W18 migration is applied to ZAVQERA Development and
follow-up persistence is confirmed live. A session run against an environment
where saving a follow-up returns an error will produce findings about the
outage, not about the product.

## Participants

Five people, each with a genuine multi-step goal of their own. Do not supply the
goal; a borrowed goal produces borrowed behaviour.

| Ref | Scenario | Goal must be |
|---|---|---|
| T01 | A personal project that matters to them | real and currently unfinished |
| T02 | Renewing a passport or similar document | real or realistically imminent |
| T03 | Following up with a business partner | a real pending thread |
| T04 | Opening a small business | real or seriously considered |
| T05 | Any other meaningful real-world multi-step goal | theirs, not ours |

Each session needs two sittings separated by at least a day, because the
follow-up and "return later" behaviour cannot be observed in one sitting.

## Task, given verbatim

> Use this tool to make progress on <their goal>. Work through it as you
> normally would. Think aloud. I will not answer questions while you work.

That is the entire brief. Do not name features. Do not say "Mission", "Waiting",
"Verification" or "Outcome" before the participant does — whether they reach
those concepts unaided is the thing being measured.

Sitting two, given verbatim:

> Come back to what you set up and carry on.

## What the participant should reach unaided

Create a mission → define success → add actions → identify the next step → use
In Progress → use Waiting → set a follow-up → leave → return → record what
happened → complete an action → look at the outcome.

Record where they stop, not only where they succeed.

## Intervention rule

Do not coach. If a participant is stuck, wait a full 60 seconds before saying
anything, then say only: *"What would you expect to happen?"* Record every
intervention, with its timestamp, as a finding. An intervention is evidence of a
defect, not a rescue.

## What to record — objective evidence only

Record only what was observed: what the participant did, where the cursor went,
what they said, and how long they paused. Do not record interpretation in the
observation column.

* Where they hesitated — with the duration.
* Where they misunderstood — quote them.
* Where they could not find something — note where they looked first.
* Wording they read aloud, queried, or got wrong.
* Any step that took more actions than the participant expected.
* Whether "Mission" was understood — and what they called it instead.
* Whether "Waiting" was understood — specifically, did they read it as failure?
* Whether the follow-up date was understood as a reminder to themselves.
* Whether they knew what to do next, at every point.
* Whether they could state the difference between Verification and Outcome.
* Anything they expected to exist and did not find.

Prohibited: invented scores, rankings between participants, satisfaction
ratings, and any feature added because a single participant asked for it.

## Recording instrument — one per session

```
SESSION:        T0_
DATE:           sitting 1 ______  sitting 2 ______
GOAL (theirs):
COMPLETED UNAIDED:  create / success / actions / next step /
                    in progress / waiting / follow-up / return /
                    record / complete / outcome
STOPPED AT:
INTERVENTIONS:  (time, what was said, why)

OBSERVATIONS
  time | where | what the participant did or said | duration of pause

TERMINOLOGY
  "Mission" understood?        yes / no / partially — what they said:
  "Waiting" understood?        yes / no / partially — read as failure?
  Follow-up understood?        yes / no / partially —
  Verification vs Outcome?     yes / no / partially —

VERBATIM QUOTES

WHAT THEY EXPECTED THAT DOES NOT EXIST
```

## Analysis — only after all five sessions

Group every finding into exactly one category:

* **A. Recurring usability problems** — observed in 3 or more sessions.
* **B. Recurring functional problems** — the product did the wrong thing, in 2
  or more sessions.
* **C. Isolated feedback** — observed once.
* **D. Feature requests** — recorded, not acted on.
* **E. Infrastructure issues** — deployment, latency, auth, errors.

### Promotion rule

Only A and B become W19 candidates automatically. B outranks A: a product that
does the wrong thing is worse than one that is hard to understand.

C is recorded and held. A single participant's difficulty is not evidence of a
pattern, and acting on it is how an MVP acquires features nobody needs.

D is never promoted on request volume in a round this small. A feature request
is promoted only if the underlying *problem* also appears as an A or B finding.

E is fixed outside the product backlog.

## Findings

_Empty. To be completed only after the sessions are run._

| # | Category | Finding | Sessions | Evidence |
|---|---|---|---|---|
| — | — | _no sessions run_ | — | — |

## W19 candidates

_Empty. Derivable only from the table above._
