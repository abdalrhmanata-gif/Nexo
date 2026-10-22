# Web development

Run the local checks with `npm test`. The authenticated browser test is separate and never runs as part of that command.

To run the Development-only E2E test, provide two disposable, pre-created Supabase Development users and the publishable app configuration:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://<development-project>.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "<development-publishable-key>"
$env:ZAVQERA_E2E_USER_A_EMAIL = "e2e-a@example.test"
$env:ZAVQERA_E2E_USER_A_PASSWORD = "<password>"
$env:ZAVQERA_E2E_USER_B_EMAIL = "e2e-b@example.test"
$env:ZAVQERA_E2E_USER_B_PASSWORD = "<password>"
npm run test:e2e
```

`npm run test:e2e` starts the local Next.js server, uses Chromium through Playwright, creates a uniquely tagged mission as user A, verifies the authenticated mutation and history path, checks user B isolation, and signs out. It requires network access to the isolated Development Supabase project; it never accepts or exposes a service-role credential.
