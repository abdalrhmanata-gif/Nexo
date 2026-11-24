import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "./lib/supabase/config";
import { safeNextPath } from "./lib/auth/redirect.mjs";

/**
 * A signed-out visitor headed for a plan they chose (a goal, a template, a
 * guide, a prefilled mission) is almost always new, so they get the sign-up
 * page, which links to sign-in for the few who already have an account.
 * Everyone else headed into the workspace gets sign-in.
 */
function authPageFor(pathname: string, search: URLSearchParams) {
  if (pathname === "/app/start") return "/auth/sign-up";
  if (pathname === "/app/missions/new" && search.get("name")) return "/auth/sign-up";
  return "/auth/sign-in";
}

export async function middleware(request: NextRequest) {
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
  if (request.nextUrl.pathname.startsWith("/app") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = authPageFor(request.nextUrl.pathname, request.nextUrl.searchParams);
    // Keep the full destination, including query parameters. This is required
    // for shareable Mission templates to survive the sign-in/sign-up handoff.
    url.search = "";
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }
  const isConfirmationEndpoint = request.nextUrl.pathname === "/auth/callback"
    || request.nextUrl.pathname === "/auth/confirm";
  // A reset link signs the person in and then lands here to choose the new
  // password. Sending signed-in people away from this page, as the other
  // /auth pages do, would make the reset impossible to finish.
  const isPasswordReset = request.nextUrl.pathname === "/auth/reset-password";
  if (request.nextUrl.pathname.startsWith("/auth/") && user && !isConfirmationEndpoint && !isPasswordReset) {
    // Already signed in: go where the link was going. A plan saved from a
    // tab that did not know about the session used to land on the bare
    // workspace and lose the plan.
    return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url));
  }
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/auth/:path*"],
};
