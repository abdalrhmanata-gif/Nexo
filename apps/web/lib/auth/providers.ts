import { supabasePublishableKey, supabaseUrl } from "../supabase/config";

/**
 * Whether "Continue with Google" works right now. The button is shown only
 * when Supabase says the provider is on, so switching it on (or off) in the
 * Supabase dashboard is the whole change: no deploy, and never a button that
 * leads to an error page. The answer is public (any visitor's browser can
 * ask the same endpoint) and cached for five minutes.
 */
export async function googleSignInEnabled(): Promise<boolean> {
  if (!supabaseUrl || !supabasePublishableKey) return false;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabasePublishableKey },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return false;
    const settings = await response.json() as { external?: { google?: unknown } };
    return settings.external?.google === true;
  } catch {
    // Unreachable settings mean no Google button, not a broken page.
    return false;
  }
}
