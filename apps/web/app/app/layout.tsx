import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { getAuthenticatedUser } from "../../lib/supabase/server";

/**
 * Enforce authentication in the server-rendered route tree as a second
 * boundary. Netlify middleware must not be the only guard protecting /app.
 */
export default async function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    redirect("/auth/sign-in?next=%2Fapp");
  }

  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) {
    redirect("/auth/sign-in?next=%2Fapp");
  }

  return children;
}
