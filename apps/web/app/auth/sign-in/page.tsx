import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "../../../components/auth-form";
import { LocalizedText } from "../../../components/localized-text";
import { safeNextPath } from "../../../lib/auth/redirect.mjs";
import { googleSignInEnabled } from "../../../lib/auth/providers";

// Name the destination instead of dropping the visitor on an unexplained form.
// The header links every workspace area for a signed-out visitor too, each
// carrying ?next=, so this line tells them what signing in will open.
const DESTINATIONS: Record<string, string> = {
  "/app": "Sign in to open your workspace.",
  "/app/business": "Sign in to open the business workspace.",
  "/app/missions/new": "Sign in to start a new mission.",
  "/app/opportunities": "Sign in to open Opportunity Intelligence.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params?.next ? safeNextPath(params.next) : null;
  const destination = next
    ? DESTINATIONS[next] ?? (next.startsWith("/app/start?") ? "Sign in to save your plan." : undefined)
    : undefined;
  const google = await googleSignInEnabled();
  // The way back to sign-up keeps the destination: a plan someone pressed
  // "Save" on used to be dropped by this link.
  const signUpHref = next ? `/auth/sign-up?next=${encodeURIComponent(next)}` : "/auth/sign-up";

  return <div className="container"><div className="form">
    <p className="eyebrow"><LocalizedText en="Welcome back" /></p>
    <h1 className="detail-title"><LocalizedText en="Sign in." /></h1>
    <p className="detail-intent">
      <LocalizedText en={destination ?? "Access your workspace and keep authority bounded."} />
    </p>
    <Suspense fallback={<p><LocalizedText en="Loading sign-in…" /></p>}><AuthForm mode="sign-in" google={google} /></Suspense>
    <p><Link href="/auth/forgot-password"><LocalizedText en="Forgot your password?" /></Link></p>
    <p>
      <LocalizedText en="Need an account?" />{" "}
      <Link href={signUpHref} prefetch={false}><LocalizedText en="Create one" /></Link>
    </p>
  </div></div>;
}
