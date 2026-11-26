// Headers every response carries.
//
// A signed-out probe of production on 2026-11-10 found HSTS and nosniff —
// both supplied by the host — and nothing else. The application set no
// header of its own, so any site could load ZAVQERA inside a frame and lay
// its own page over the buttons: a signed-in visitor clicking what looks
// like someone else's button would be pressing "Delete mission" here.
//
// What is deliberately not here is a script-restricting Content-Security-
// Policy. Next.js emits inline scripts that such a policy has to allow by
// nonce or hash, and one written without exercising every page breaks the
// application in ways a unit test will not show. frame-ancestors is the
// part of CSP that closes the hole above and cannot break rendering.
const securityHeaders = [
  // Both, because frame-ancestors supersedes X-Frame-Options where it is
  // understood and older browsers understand only the latter.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // The full URL of a mission page is not another site's business.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The product uses none of these; saying so means an injected script
  // cannot quietly ask for them.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The PDF of a checklist is drawn with the fonts in public/fonts; the
  // server function that makes it needs them on its own disk.
  outputFileTracingIncludes: {
    "/app/missions/[id]/pdf": ["./public/fonts/*.ttf"],
  },
  // Browsers ask for /favicon.ico whatever the page declares. It was a 404
  // that woke a server function each time; the real icon is app/icon.svg.
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
