# ZAVQERA Netlify Deployment Audit — 2026-10-01

## Live account evidence

Site: `unique-kringle-3ce321`
Site ID: `53e470f1-30da-497e-85f6-16179db4c985`
Project dashboard: https://app.netlify.com/projects/unique-kringle-3ce321

### Production deploy

- Deploy ID: `6aba41d27d13f7000874b0a7`
- State: `ready`
- Context: `production`
- Branch: `main`
- Commit: `89ff12f23fba21eee11aad593275ec23477ec6ec`
- Published at: 2026-09-28T10:30:50Z
- Primary URL: https://unique-kringle-3ce321.netlify.app
- The production deploy is on an older main commit, not the active feature branch.

### Active feature-branch deploy

- Deploy ID: `6abe25c07d794f000812021c`
- State: `ready`
- Context: `branch-deploy`
- Branch: `zavqera/alternative-web-deployment`
- Commit: `a89d0a1b1516fffc53c981c594202da602b33808`
- Updated at: 2026-10-01T09:22:46Z
- Preview URL: https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app
- Next.js framework detected; Netlify Next.js server handler and one edge function are present.
- Deploy summary reports redirects and one header rule processed without errors.
- Lighthouse plugin summary for `/`: Performance 95, Accessibility 100, Best Practices 100, SEO 100, PWA 20. These are deploy-time plugin scores, not a full authenticated E2E test.

## Conclusions

1. Netlify is connected to the repository and has a successful branch deploy.
2. The production URL currently points to a `main` deployment at commit `89ff12f...`, while the feature branch has a separate successful preview at `a89d0a1...`.
3. `ready` is deployment status only. The available Netlify connector did not establish that live browser routes, authentication, Supabase runtime configuration, or protected APIs work end-to-end.
4. A direct automated fetch of the site URLs was not conclusive in this audit; no claim of full runtime health is made.
5. Do not trigger a production redeploy or switch production branch until the preview routes and authentication are verified and the intended release commit is selected.

## Safest next actions

- Open and smoke-test the branch preview on mobile: homepage, sign-in, app route, mission list, and one authorized mutation.
- Confirm the deployed environment has the correct Supabase Development URL and public anon key; never expose service-role credentials in client-side variables.
- Verify sign-in and owner isolation with two test users before release.
- Once checks pass, publish a reviewed release commit to production through the existing Netlify release controls. Do not alter Supabase Main or merge unverified schema changes as part of hosting repair.
