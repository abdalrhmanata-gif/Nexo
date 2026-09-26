# ZAVQERA — Public Preview Deployment (First-User Validation)

Goal: a real, publicly reachable preview URL for the ZAVQERA Web MVP (`apps/web`) so first-user
validation can be run with real testers.

This document records the verified deployment path, the repository-side configuration, and the one
remaining manual dashboard step. It intentionally contains **no** secrets, tokens, or credentials.

## 1. Current verified state

The Vercel project `nexo` (owner scope `abdalrhmanata-1982`) is already connected to this
repository through the Vercel GitHub integration. This was confirmed via the GitHub Deployments
API, not assumed:

| Environment | Git ref | Deployment state |
| --- | --- | --- |
| Preview | `bb095b7` (`zavqera/integrate-origin-main-clean`) | `success` |
| Production | `fcac980` (`main`) | `success` |

So the build pipeline itself is healthy. **Builds are not the problem.**

### Monorepo root directory is already correct

The repository root is a Flutter project and contains no `package.json`. A Vercel build would fail
immediately if the project's **Root Directory** were the repository root. Because builds succeed,
the Vercel project's Root Directory is already set to `apps/web`. No repository change can set or
override Root Directory — it is a project-level dashboard setting only.

## 2. The actual blocker: Deployment Protection

Every deployment URL belonging to the project returns `HTTP 302` to `vercel.com/sso-api`, which
redirects anonymous visitors to `vercel.com/login`:

```
https://nexo-17ege1eom-abdalrhmanata-1982.vercel.app                       -> 302 vercel.com/sso-api
https://nexo-git-main-abdalrhmanata-1982.vercel.app                        -> 302 vercel.com/sso-api
https://nexo-git-zavqera-integrate-origin-main-clean-abdalrhmanata-1982... -> 302 vercel.com/sso-api
```

This is **Vercel Deployment Protection ("Vercel Authentication")**. It gates the deployment behind
Vercel account login, so external first-user testers cannot reach it.

This is an account/team authorization setting. It **cannot** be disabled from repository
configuration, from `vercel.json`, or from a GitHub Actions workflow. No repository-side change can
fix it.

> Note: `https://nexo.vercel.app` responds `200` but serves an unrelated third-party project
> ("Plataforma para el ecosistema musical"). It is **not** this project and must not be used or
> referenced as the ZAVQERA preview URL.

## 3. Repository-side change included here

A single file, `apps/web/vercel.json`, pins the monorepo build so it stays deterministic and
matches `.github/workflows/web.yml`:

```json
{
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npm run build"
}
```

Because the project's Root Directory is `apps/web`, Vercel reads this file. It changes no product
behavior, adds no environment variables, and adds no secrets.

## 4. Environment variables

`apps/web/lib/supabase/config.ts` reads only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Both are **public, non-secret** client configuration. `isSupabaseConfigured()` makes the app
degrade gracefully when they are absent, so `npm run build` succeeds with no environment
configured at all — which is why the Vercel builds already pass.

For a functional signed-in tester flow, these two public values must be set **in the Vercel
dashboard** for the Preview environment, pointing at the **Development** Supabase project. They are
deliberately not committed here. No service-role key, database password, or any other secret is
required by the web app, and none may ever be added.

## 5. Remaining manual dashboard step (authorization-gated)

This is the only outstanding work, and it must be performed by an account with Vercel project
access. It is not a code change.

1. Open the Vercel project `nexo` (scope `abdalrhmanata-1982`).
2. Go to **Settings → Deployment Protection**.
3. Set **Vercel Authentication** to **Disabled** (or restrict protection to Production only, so
   Preview deployments are publicly reachable).
4. Optionally, under **Settings → Environment Variables**, add the two `NEXT_PUBLIC_*` values above
   for the **Preview** environment, scoped to the Development Supabase project.
5. Re-deploy or push to `zavqera/integrate-origin-main-clean`.

After step 3 the following stable branch alias becomes publicly reachable and is the URL to hand to
first-user testers:

```
https://nexo-git-zavqera-integrate-origin-main-clean-abdalrhmanata-1982.vercel.app
```

Until step 3 is performed, that URL returns `302` to Vercel login for anonymous visitors.

## 6. Why no GitHub-native fallback was implemented

`apps/web` is a server-rendered Next.js application. It ships:

- Route Handlers under `apps/web/app/api/**` (mission, action, verification, outcome mutations)
- `apps/web/middleware.ts` enforcing the authenticated route boundary
- dynamic, per-request server rendering for `/app/**`

GitHub Pages serves static files only. Publishing through GitHub Pages would require
`output: "export"`, which would delete the API routes and middleware and break the authorization
boundary that W13/W14 verify. That is an architectural compromise and is explicitly out of scope.

Every other repository-connected host capable of running this app (Netlify, Render, Railway,
Cloudflare) would require creating a **new** project plus adding **new** deployment credentials to
this repository. Both are disallowed by the issue constraints, and neither is a smaller change than
flipping one existing Vercel setting.

Conclusion: the existing Vercel project is already the correct and smallest path. The remaining gap
is one authorization-gated dashboard toggle, documented above.
