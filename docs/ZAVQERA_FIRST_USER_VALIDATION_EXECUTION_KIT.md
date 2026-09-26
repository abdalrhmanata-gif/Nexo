# ZAVQERA First-User Validation Execution Kit

This kit operationalizes the existing First-User Validation Plan without changing product behavior.

## Session setup

Target 5–10 people who currently manage a meaningful multi-step obligation. Prefer a mix of administrative work, professional follow-up, multi-step planning, and postponed personal projects.

Use the current local-first MVP build. Start with a clean state for each participant.

Do not disclose:
- ZAVQERA architecture or security model.
- Expected answers.
- Example steps for the participant's scenario.
- Which behaviors count as success.

Do record:
- timestamps;
- direct quotations;
- observable hesitation or blockage;
- moderator interventions;
- whether the behavior was unprompted, prompted, or blocked.

Do not record passwords, tokens, confidential business data, or unnecessary personal information.

## 20-minute session

### 0–2 min: scenario

Read only the selected scenario title.

Use one of:
- Renew my passport
- Follow up with a potential business partner
- Open a small business
- Complete an important personal project

Do not explain what ZAVQERA is supposed to do.

### 2–10 min: create and shape the mission

Read exactly:

> Create a mission for this goal. Add the steps you think are needed, in the order you would do them. Save it.

Observe without helping unless the participant is blocked.

Record:
- time to find New mission;
- time to save;
- whether at least three meaningful steps are created;
- hesitation or confusion around the goal, criteria, and steps;
- whether the participant asks what ZAVQERA is for.

When blocked, ask only:

> What would you try next?

If still blocked, provide the minimum help needed and mark the observation as prompted or blocked.

### 10–15 min: follow-through loop

Read exactly:

> Tell me what you would do next. Mark one step In Progress, then Waiting, and set a follow-up date.

Then ask the participant to leave the mission.

Record:
- whether current step / next attention is understood;
- meaning assigned to In Progress;
- meaning assigned to Waiting;
- whether follow-up is understood as a future check;
- whether progress is interpreted as completed versus remaining work.

Do not correct their interpretation during the task.

### 15–18 min: return and outcome

Ask the participant to return later in the product flow.

Read:

> Record what happened, complete a step, return to the workspace, and explain what still needs attention.

Record:
- whether the participant recovers the correct mission;
- whether Waiting/follow-up/today/overdue work is visible;
- whether outcome notes are found without help;
- whether remaining work is correctly identified.

### 18–20 min: interview

Ask in order:

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

Capture the participant's natural description before explaining the intended product promise.

## Moderator discipline

Do not:
- suggest better wording;
- suggest steps;
- defend the product;
- explain why a control exists;
- turn feature requests into requirements;
- count prompted success as unprompted success.

Do:
- stay neutral;
- record what happened;
- preserve exact language;
- mark interventions;
- separate preference from repeated behavioral evidence.

## Decision gate

After 5–10 sessions, populate docs/ZAVQERA_FIRST_USER_VALIDATION_EVIDENCE_TEMPLATE.md.

Only promote an item when the evidence supports one of:
- observed problem;
- repeated behavior;
- validated product need.

A requested feature without repeated observed behavior is not a roadmap decision.

The next milestone should address the highest-frequency High-severity validated friction, using the smallest plausible product change, followed by another focused validation round.

If no High-severity repeated friction appears, hold scope and continue validation.

## Evidence quality gate

A validation round is not complete until:
- at least 5 sessions are recorded;
- every session has timestamps and direct observations;
- moderator interventions are marked;
- aggregate signals are filled;
- friction is classified by evidence type;
- one of Continue / Change-or-narrow / Hold-scope is selected with evidence;
- no secrets or unnecessary personal data are included.