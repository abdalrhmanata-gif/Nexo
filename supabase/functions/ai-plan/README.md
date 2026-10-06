# ZAVQERA AI Plan

Authenticated Edge Function for converting a validated ZAVQERA goal/intent into a structured mission-plan proposal.

## Secrets

Set OPENAI_API_KEY in the Supabase Development project's Edge Function secrets. Do not commit it.

Optional: set OPENAI_MODEL to override the default model.

## Security boundary

- Requires a valid Supabase user JWT.
- Does not execute external actions.
- Does not grant authority.
- Returns a proposal only; ZAVQERA policy/authorization must validate it before persistence or execution.
- Input is bounded and requests are conservatively rate-limited per user in the function instance.

## Endpoint

POST /functions/v1/ai-plan

Body:
- goal: string
- intent?: { objective?, constraints?, successCriteria?, authorityRequests? }
- context?: string
