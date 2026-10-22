const required = [
  "ZAVQERA_E2E_USER_A_EMAIL",
  "ZAVQERA_E2E_USER_A_PASSWORD",
  "ZAVQERA_E2E_USER_B_EMAIL",
  "ZAVQERA_E2E_USER_B_PASSWORD",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(JSON.stringify({
    status: "BLOCKED",
    reason: "Development E2E credentials/configuration are absent.",
    missing_variables: missing,
  }, null, 2));
  process.exit(2);
}
console.log(JSON.stringify({ status: "READY", missing_variables: [] }));
