# ZAVQERA Web: Netlify deployment handoff

This is an **alternative Preview path**, not a replacement for the Vercel project.
The Flutter MVP remains the first-user behavioral validation product. Do not merge
PR #12 or #19 or deploy `main` for ZAVQERA validation.

## Why Netlify

The existing `apps/web` app uses Next.js 15 App Router, server-rendered pages,
`middleware.ts` for authentication, and Route Handlers under `app/api/`. A
static export would break those behaviors. Netlify's built-in OpenNext adapter
supports them without changing application code or pinning an adapter package.
Cloudflare Workers' current recommended vinext path is a beta reimplementation
and needs a compatibility check and migration; its OpenNext path needs additional
adapter and Wrangler configuration. Render can run `next start` as a Node Web
Service, but a free service spins down after 15 minutes of inactivity and may
take about a minute to wake, which is poor for time-boxed user sessions.
Netlify has a free credit-limited tier; check the team's usage before relying
on it for a validation round.

## Import the existing repository

An authorized Netlify owner must connect `abdalrhmanata-gif/Nexo` through
**Projects > Add new project > Import an existing project > GitHub**. Select
the existing repository; do not start from a template or create a static site.
Set the site's **production branch** to
`zavqera/integrate-origin-main-clean`, *not* `main`. "Production branch" here
is Netlify's routing term; the backend must remain Supabase **Development**.
If the import flow cannot select that branch, set it under the site's branch
settings before enabling automatic deployment. Do not publish `main`.

This repository is not an npm workspace: the only web `package.json` and lockfile
are in `apps/web`. The root `netlify.toml` sets Base directory to `apps/web`,
build command to `npm run build`, and publish directory to `.next` (relative
to the base). Netlify installs dependencies from the app lockfile; the existing
CI uses `npm ci`. Confirm the Netlify build log shows the lockfile-based npm
install and Next.js/OpenNext function and edge-function generation. Do not set
the publish directory to `out`, set `output: "export"`, or add a catch-all
redirect: those would bypass SSR, Route Handlers, or middleware.

Until this configuration PR is merged into the stable branch, deploy its
**Deploy Preview** to exercise the new config; a deployment of the unchanged
stable commit may require the same Base directory, build command, and publish
directory set manually in the Netlify dashboard. Do not claim that the
configuration file is already active on the stable branch.

## Development environment

In the Netlify site's **Project configuration > Environment variables**, set:

- `NEXT_PUBLIC_SUPABASE_URL` to the public ZAVQERA Development endpoint
  `https://mrwmmbytcymqgwvcoywd.supabase.co`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the **Development** publishable key.

Configure the values for the actual Netlify deploy context: **Production** if
the Netlify production branch is the stable ZAVQERA branch, and **Deploy
Previews** for testing this PR. Include **Builds** and **Functions** scopes
(Functions includes Edge Functions); do not limit them to one scope. The
`NEXT_PUBLIC_` variables are public client configuration, but do not commit
their values or publish the key in PR comments. Never use a service-role key.
Redeploy after changing build-time variables. The app otherwise builds but
falls back to mock missions and skips middleware authentication; a passing
build alone is **not** evidence of a working Development-backed preview.

## Release gate

Record the actual `*.netlify.app` URL supplied by Netlify; do not guess it.
Use a fresh unauthenticated session and check:

1. `/` displays the ZAVQERA Web app;
2. `/auth/sign-in` displays the sign-in form;
3. `/app` redirects to `/auth/sign-in` (not an anonymous mock workspace);
4. an anonymous mutation Route Handler denies access;
5. the deployed configuration targets **Development**, not Supabase Main.

Authenticated mission follow-through requires separate testing with a real
Development account. Do not claim it from anonymous route checks alone.
Do not call the alternative deployment ready before the live URL, routes,
middleware, and Development target have all been verified.

References: [Netlify Next.js / OpenNext](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/),
[monorepos](https://docs.netlify.com/build/configure-builds/monorepos/),
[environment variable scopes and contexts](https://docs.netlify.com/build/environment-variables/overview/),
[Cloudflare Next.js Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/),
[Render Next.js](https://render.com/docs/deploy-nextjs-app), and
[Render free instance limits](https://render.com/docs/free).
