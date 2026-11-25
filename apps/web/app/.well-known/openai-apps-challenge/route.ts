// Domain verification for ZAVQERA's ChatGPT plugin (OpenAI Platform → Plugins
// → MCPs → Domain verification). OpenAI fetches this URL and expects the exact
// token as plain text: no JSON, no redirect. The token is public by design;
// it only proves that whoever controls zavqera.com submitted the plugin.

export const dynamic = "force-static";

const OPENAI_APPS_CHALLENGE = "kykkGu9aPDs2A0JOfAAIREdQOiqXJwFqiovP1iS44yU";

export function GET() {
  return new Response(OPENAI_APPS_CHALLENGE, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
