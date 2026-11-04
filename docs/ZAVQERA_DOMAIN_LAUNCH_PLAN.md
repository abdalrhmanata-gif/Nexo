# Domain launch plan

2026-10-01. **CUSTOM DOMAIN: NOT CONFIGURED. Owner choice pending.**
No purchase, registration, DNS, TLS setting or auth configuration was changed.

| Surface | Current state |
|---|---|
| Temporary beta URL | https://zavqera-alternative-web-deployment--unique-kringle-3ce321.netlify.app serves tested W21 runtime |
| Current primary URL | https://unique-kringle-3ce321.netlify.app serves old main artifact; checked routes 404 |
| Future canonical production origin | UNSELECTED; must serve the approved tested artifact and approved backend |

Continuing the temporary Netlify URL is an owner-selectable controlled-beta
option, not an implicit public launch. It is publicly reachable, not an invite
gate; explicitly scope participants and the Development-data risk. Do not
advertise the broken primary URL or imply a secret URL protects data.

## If the owner chooses a custom domain

1. Confirm ownership of the exact domain, desired apex/www canonical origin and
   authorization to change its DNS. No domain registration is included here.
2. Resolve Netlify capacity and obtain explicit approval for the tested artifact
   on the intended production site. Verify source SHA/branch without touching
   git main; attaching a domain to the old primary artifact will not repair it.
3. In Netlify project Domain management, add the approved domain. At the existing
   DNS provider, use the exact verification/A/ALIAS/CNAME records Netlify supplies
   for that hostname. Do not invent IPs, replace unrelated MX/TXT records or move
   nameservers without specific approval. Privately record previous DNS/TTL.
4. Wait for authoritative DNS propagation and Netlify ownership verification.
   Verify HTTPS certificate hostname/chain/expiry for every served alias and
   HTTP-to-HTTPS plus canonical-host redirects. No TLS-warning bypasses.
5. On the owner-approved Supabase backend only, authorize Site URL and exact
   redirect allowlist entries for that origin. Account for `/auth/callback`
   (PKCE) and `/auth/confirm` (token-hash flow) according to the actual email
   templates; do not introduce broad wildcard production callbacks. Retain a
   needed beta origin only under the owner's access plan.
6. Verify public pages, protected redirects, signup confirmation/callback,
   sign-in, refresh/return and sign-out on the canonical HTTPS origin. Use an
   owner-approved auth smoke, never hosted automated full-loop fixtures.
   Confirm callback stays on that origin and unsafe external `next` targets
   cannot redirect away. Do not record tokens from email URLs in evidence.
7. Verify apex/www and old approved URL redirects do not loop or lose the intended
   safe return path. Keep sensitive callback query strings out of logs/screenshots.
   Record canonical URL, artifact/commit, backend context, TLS checks and results.

An origin change does not transfer browser cookies automatically; expect users
may need to sign in again. Do not remove the previous callback allowlist until
the owner accounts for outstanding confirmation links and rollback requirements.

## Rollback and acceptance

Capture DNS/auth settings privately before authorized changes. If verification
fails, stop announcing the new domain; owner may restore the recorded settings
and approved previous endpoint. DNS rollback is subject to TTL, and restoring
a hostname does not restore data or resolve Netlify deployment limits.

Accept only when the approved origin serves the tested artifact, TLS and
redirects work, auth smoke passes and the backend choice is explicit.
No domain option has been selected in the [decision sheet](ZAVQERA_OWNER_LAUNCH_DECISIONS.md).
