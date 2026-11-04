# ZAVQERA W18.7–W18.9 — First structured user learning round

Status: **complete — 5 / 5 sessions, owner-confirmed.**

T01–T05 were run and confirmed by the owner as passing. The observation records
below are intentionally not filled in: the detailed telemetry (quotes, timings,
hesitation points) was not returned to this repository, and inventing it would
make the round worthless. The gate result is recorded; the transcript is not
reconstructed.

This document remains the protocol and the recording instrument for future
rounds.

## Precondition — met

The W18 migration is applied to ZAVQERA Development and was verified
independently, not assumed:

| Probe (unauthenticated, against ZAVQERA Development) | Before apply | Now |
|---|---|---|
| `transition_mission_action` with 5 arguments | `404 PGRST202` — signature absent | `401 42501` — signature present, closed to `anon` |
| `transition_mission_action` with 3 arguments | `401 42501` | `401 42501` — existing call sites still resolve |

`42501` is the correct and desired result for an anonymous caller: the function
exists and refuses to run for anyone but an authenticated user.

### Environment the sessions must use

| | |
|---|---|
| URL | `https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app` |
| Branch | `zavqera/alternative-web-deployment` |
| Database | ZAVQERA Development |

Do **not** use the site's root production URL. That still serves the old `main`
build and does not contain W17 or W18. Sending a participant there would measure
software that is two work packages out of date.

## Participants

Five people, each with a genuine multi-step goal of their own. Do not supply the
goal; a borrowed goal produces borrowed behaviour.

| Ref | Scenario | Goal must be |
|---|---|---|
| T01 | A meaningful, important personal project | real and currently unfinished |
| T02 | Passport, identity, document or administrative renewal | real or realistically imminent |
| T03 | Following up with a business partner or another person | a real pending thread |
| T04 | Opening or organising a small business or project | real or seriously considered |
| T05 | Another real multi-step goal, selected by the participant | theirs, not ours |

Use realistic goals. Do not create fake business data and do not stage fake
external outcomes.

Each session needs two sittings separated by at least a day, because the
follow-up and "return later" behaviour cannot be observed in one sitting.

## Task, given verbatim

Instruct the participant only enough to start:

> Create a mission for this goal.
> Add the steps you think are needed, in the order you would do them.
> Save it.
> Tell me what you would do next.
> Mark one step In Progress, then Waiting, and set a follow-up date.
> Leave the mission and return later.
> Record what happened, complete a step, return to the workspace, and explain
> what still needs attention.

Do not coach the participant through the intended workflow unless they are
completely blocked. Do not explain a term before the participant uses it —
whether "Mission", "Waiting", "Verification" and "Outcome" are understood
unaided is the thing being measured.

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

Record observations, not opinions invented by the system. Record what the
participant did, where they looked first, what they said, and how long they
paused. Interpretation belongs in the analysis, not in the observation.

Answer all twenty for every session:

1. Did the participant understand what a Mission represents?
2. Did they create a meaningful Mission?
3. Did they define useful actions?
4. Did they understand the order of actions?
5. Did they know what to do next?
6. Did they understand In Progress?
7. Did they understand Waiting?
8. Did they understand Follow-up?
9. Could they leave and return to the Mission?
10. Could they understand the current state when returning?
11. Did they understand what still needs attention?
12. Did they understand completion?
13. Did they understand verification?
14. Did they understand outcome?
15. Where did they hesitate?
16. Where did they make a mistake?
17. Where did they ask for clarification?
18. What wording confused them?
19. What UI element did they fail to notice?
20. What workflow required unnecessary effort?

Do not ask leading questions such as "Did you like the Mission system?". Prefer
observation over self-report: what a participant does is evidence, what they say
they would do is not.

Prohibited: invented scores, rankings between participants, satisfaction
ratings, and any feature added because a single participant asked for it.

## Success signals

Look for evidence of these, and record their absence just as carefully:

* a useful Mission
* meaningful actions
* a clear next action
* an understandable Waiting state
* an understandable follow-up
* successful return to the Mission
* a clear attention and progress state
* outcome understood
* evidence that the product feels like follow-through rather than a generic
  to-do list

Do not convert these into arbitrary numerical scores.

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

OBSERVATION LOG
  time | where | what the participant did or said | duration of pause

TWENTY QUESTIONS  (1-14 yes / no / partially, with what they said;
                   15-20 free text)
  01 Mission understood ..........
  02 Meaningful Mission created ..
  03 Useful actions defined ......
  04 Order understood ............
  05 Knew what to do next ........
  06 In Progress understood ......
  07 Waiting understood ..........
  08 Follow-up understood ........
  09 Left and returned ...........
  10 State understood on return ..
  11 Knew what needs attention ...
  12 Completion understood .......
  13 Verification understood .....
  14 Outcome understood ..........
  15 Hesitated at ...............
  16 Mistakes made ..............
  17 Asked for clarification at ..
  18 Confusing wording ..........
  19 Element not noticed ........
  20 Unnecessary effort at ......

SUCCESS SIGNALS OBSERVED / ABSENT

VERBATIM QUOTES

WHAT THEY EXPECTED THAT DOES NOT EXIST
```

## Session records

Owner-confirmed as PASS for T01–T05. Per-session observation detail was not
returned to the repository and is deliberately not reconstructed here.

### T01 — meaningful personal project

_Run. Result: pass. No observation detail recorded._

### T02 — document or administrative renewal

_Run. Result: pass. No observation detail recorded._

### T03 — following up with a partner or another person

_Run. Result: pass. No observation detail recorded._

### T04 — opening or organising a small business

_Run. Result: pass. No observation detail recorded._

### T05 — participant's own multi-step goal

_Run. Result: pass. No observation detail recorded._

## Analysis — only after all five sessions

Group every observation into exactly one category:

* **A. Repeated usability problems** — observed in 3 or more sessions.
* **B. Repeated functional problems** — the product did the wrong thing, in 2
  or more sessions.
* **C. Isolated problems** — observed once.
* **D. Feature requests** — recorded, not acted on.
* **E. Infrastructure problems** — deployment, latency, auth, errors.

Record strengths separately from problems, using the success-signal list. A
strength is only a strength if it was observed unaided.

### Promotion rule

Only A and B become W19 candidates automatically. B outranks A: a product that
does the wrong thing is worse than one that is hard to understand.

C is recorded and held. A single participant's difficulty is not evidence of a
pattern, and acting on it is how an MVP acquires features nobody needs. One
person's preference is not a product defect.

D is never promoted on request volume in a round this small. A feature request
is promoted only if the underlying *problem* also appears as an A or B finding.

E is fixed outside the product backlog.

Do not change code during a session merely because one participant is confused.
Collect the evidence first.

## Findings

No participant-derived findings were returned to the repository, so none are
recorded. The defects fixed in W19 came from a direct audit of the deployed
product, not from these sessions, and are documented separately in
`docs/ZAVQERA_W19_PRODUCT_AUDIT.md`.

| # | Category | Finding | Sessions | Evidence |
|---|---|---|---|---|
| — | — | _no participant findings returned_ | — | — |

## Strengths

_Not recorded. Derivable only from observed, unaided success._

## W19 candidates

None derived from this round. W19 scope was set by the product audit instead.
