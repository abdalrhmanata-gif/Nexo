import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Use dynamic environment access here so Next.js does not inline the
  // public Supabase key into the generated middleware bundle.
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabasePublishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

  if (!supabaseUrl || !supabasePublishableKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (request.nextUrl.pathname === "/auth/reset-password") {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
  }
  if (request.nextUrl.pathname.startsWith("/app") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  const isConfirmationEndpoint = request.nextUrl.pathname === "/auth/callback"
    || request.nextUrl.pathname === "/auth/confirm"
    || request.nextUrl.pathname === "/auth/reset-password";
  if (request.nextUrl.pathname.startsWith("/auth/") && user && !isConfirmationEndpoint) {
    return NextResponse.redirect(new URL("/app", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/auth/:path*"],
};
