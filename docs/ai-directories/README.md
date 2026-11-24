# Assets for the AI assistant directories

For listing ZAVQERA's MCP server (`https://zavqera.com/mcp`) in ChatGPT, Claude and Gemini.

- `zavqera-icon-512.png` is the app icon: 512 × 512 PNG, under 1 MB. Google asks for this size; ChatGPT and Claude accept it.
- `zavqera-logo-circle.svg` and `zavqera-logo-circle-512.png` are a square logo that looks circular. This is Google's requested format for the account-linking screen.
- `demo-account-seed.sql` fills the reviewers' demo account with three sample Missions. Use it as follows:
  1. The owner creates the account on zavqera.com and chooses its password.
  2. Replace `DEMO_EMAIL` with that account's email.
  3. Run the script once on Production.

  The script was tested on Development inside a transaction that was rolled back. It created 3 Missions, 14 steps, 3 completed steps with proof, 3 target dates and 4 due dates.

The submission texts, test cases and checklist are in the project doc `ZAVQERA_AI_ASSISTANTS_MCP_2026-11-24.md`.
