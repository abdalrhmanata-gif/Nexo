// Proof for Glama (glama.ai, the largest MCP directory) that whoever controls
// zavqera.com owns the ZAVQERA connector listed there. Glama fetches this URL
// and expects this exact JSON. The claim token is bound to the owner's Glama
// account, holds no personal information and is public by design; it must
// stay published for the listing to stay verified.

export const dynamic = "force-static";

const GLAMA_CLAIM = "glama_claim_lMlRdJWcg3x1fWlSIsediUVlpvjvkaKo";

export function GET() {
  return Response.json(
    { $schema: "https://glama.ai/mcp/schemas/connector.json", claim: GLAMA_CLAIM },
    { status: 200, headers: { "Cache-Control": "public, max-age=300" } },
  );
}
