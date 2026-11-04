# ZAVQERA First-User Validation Plan

## 1. Objective

Determine whether a new user independently understands and repeatedly values ZAVQERA's
promise: **turn an intention into steps, follow through, and reach an outcome**.
This is a learning exercise, not a feature request list.

Run five to ten moderated sessions with the current local-first MVP. Do not
explain ZAVQERA's architecture, authority model, or intended answer before testing.

## 2. Tester profile

Recruit people who currently manage at least one meaningful obligation with
notes, a calendar, email, or a task app. Include a mix of:

- people managing administrative tasks;
- professionals who wait on other people;
- people planning a multi-step project; and
- people with a personal project they have postponed.

Ask each tester to use their own example where practical. Record the session,
with permission, and capture exact words rather than interpreting them.

## 3. Four scenarios

Use one scenario per session when time is limited, or two scenarios with
different types of work when the tester is comfortable:

1. **Personal administrative task:** renew my passport.
2. **Professional follow-up:** follow up with a potential business partner.
3. **Multi-step project:** open a small business.
4. **Personal project:** complete an important personal project.

Give only the scenario title. The tester must define the actual steps.

## 4. Exact test tasks

Read this instruction without adding product hints:

> Create a mission for this goal. Add the steps you think are needed, in the
> order you would do them. Save it. Tell me what you would do next. Mark one
> step In Progress, then Waiting, and set a follow-up date. Leave the mission
> and return later. Record what happened, complete a step, return to the
> workspace, and explain what still needs attention.

At the end, ask the tester to create or inspect a second mission if time
allows. Do not provide example steps or demonstrate the flow first. If they
are blocked, ask: “What would you try next?” and record the blocker before
helping. Reset only between testers.

## 5. Observation points

Record timestamps and direct observations for:

- time to find “New mission” and time to save;
- hesitation while describing the goal or adding/reordering steps;
- whether the tester notices that at least one step is required;
- whether “current step” and “What needs attention next?” answer the next-action question;
- whether In Progress, Waiting, and follow-up have distinct meanings;
- whether the tester can find and edit outcome notes;
- whether progress is understood as completed steps rather than a vague score;
- whether returning to the workspace reveals waiting, today, or overdue follow-ups;
- whether the tester can leave and reopen the correct mission without help; and
- any moment they ask what ZAVQERA is for or compare it with another tool.

For every hesitation, mark **unprompted**, **prompted**, or **blocked**.

## 6. Interview questions

Ask these after the task, in order, without suggesting answers:

1. “What do you think ZAVQERA is for?”
2. “What would you use it for tomorrow?”
3. “What did Waiting mean to you?”
4. “When would you expect to use the follow-up date?”
5. “When you returned, did you immediately know what needed attention?”
6. “What, if anything, would you normally use instead?”
7. “Would you use ZAVQERA again for a real obligation? Why or why not?”
8. “What did you expect to happen that did not happen?”
9. “What capability did you want but could not find?”
10. “Which part would you use repeatedly?”

Quote the tester's natural description of ZAVQERA before discussing the product
promise.

## 7. Success signals

Count a signal only when it happens without moderator explanation:

- the tester creates a useful mission and at least three meaningful steps;
- the tester can identify the next action in under 30 seconds;
- the tester correctly explains Waiting as work paused pending something;
- the tester understands follow-up as when to check again;
- the tester returns to the workspace and identifies today's or overdue work;
- the tester can explain progress using completed versus remaining steps;
- the tester records an outcome without being told where it belongs; and
- at least half of testers describe ZAVQERA as helping work move through to an
  outcome, rather than only as a task list or reminder.

The strongest evidence is repeated voluntary use: a tester adds a second real
mission or says they would return to the workspace for an active obligation.

## 8. Failure signals

Treat these as product evidence, not automatic feature requirements:

- the tester cannot create a mission without step examples;
- the tester repeatedly asks what to do next after saving;
- Waiting is interpreted as completed, deleted, or simply delayed;
- follow-up dates are not noticed on return;
- progress is mistaken for time, priority, or confidence;
- the tester cannot recover context after leaving a mission;
- the tester describes ZAVQERA only as a generic todo list or reminder app;
- the tester completes the scripted flow but would not use it again; or
- the tester requests a feature but does not use the existing follow-through loop.

Separate a one-off preference from a repeated, high-impact failure.

## 9. Friction register template

| Issue | Frequency | Severity | User impact | Example / quote | Possible solution |
|---|---:|---|---|---|---|
|  | 0/total | Low / Medium / High |  |  |  |

Use one row per observed issue. Frequency means testers who encountered it,
not how many times one tester mentioned it. Severity is High only when it
blocks the task, causes loss of context, or undermines the core promise.
Classify each row as one of:

- **requested feature** — the tester asked for it;
- **observed problem** — the tester failed or hesitated;
- **repeated behavior** — the same pattern appeared across testers; or
- **validated product need** — repeated behavior with meaningful user impact.

Do not promote a requested feature to a roadmap item without observed evidence.

## 10. Decision criteria for the next product milestone

### Continue the current direction

Continue the follow-through model if most testers can complete the loop with
limited help, can identify a next action, understand Waiting and follow-up,
and at least half describe a reason to return or use ZAVQERA again. Choose the
next milestone from the highest-frequency High-severity friction only.

### Change or narrow the direction

Reconsider the product framing if testers consistently describe ZAVQERA as a
generic todo list, do not return after creating a mission, or cannot explain
why Waiting, follow-up, outcome, and progress belong together. Reconsider the
creation model if testers repeatedly cannot define useful steps even after
understanding the current flow.

### Hold scope

Do not add AI, notifications, accounts, cloud sync, backend execution, search,
or collaboration based only on requests. First confirm a repeated behavior and
whether a smaller wording or presentation change solves it.

The next milestone should be one focused response to the top validated
friction, followed by another small validation round. If no High-severity
pattern appears, make no product change and continue testing.
