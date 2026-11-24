import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "../../../components/auth-form";
import { LocalizedText } from "../../../components/localized-text";
import { safeNextPath } from "../../../lib/auth/redirect.mjs";
import { googleSignInEnabled } from "../../../lib/auth/providers";
import { getLanguage, getTranslate } from "../../../lib/i18n-server";
import { fill } from "../../../lib/i18n";
import { buildStartPlan, readStartRequest } from "../../../lib/start-plan";

/** The plan this sign-up will save, when it was reached from "Save this plan". */
async function pendingPlanName(next: string) {
  if (!next.startsWith("/app/start?")) return null;
  const url = new URL(next, "https://zavqera.invalid");
  const request = readStartRequest(Object.fromEntries(url.searchParams), await getLanguage());
  return request ? buildStartPlan(request).name : null;
}

export default async function SignUpPage({ searchParams }: { searchParams?: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = params?.next ? safeNextPath(params.next) : null;
  const planName = next ? await pendingPlanName(next) : null;
  const t = await getTranslate();
  const google = await googleSignInEnabled();
  const signInHref = next ? `/auth/sign-in?next=${encodeURIComponent(next)}` : "/auth/sign-in";

  return <div className="container"><div className="form">
    <p className="eyebrow"><LocalizedText en="Get started" /></p>
    {planName
      ? <>
        <h1 className="detail-title"><LocalizedText en="Save your plan." /></h1>
        <p className="detail-intent sign-up-plan">
          {fill(t("Your plan “{name}” is ready. Create a free account and it opens as soon as you are in."), { name: planName })}
        </p>
      </>
      : <>
        <h1 className="detail-title"><LocalizedText en="Create your account." /></h1>
        <p className="detail-intent"><LocalizedText en="Your workspace and missions are private to you." /></p>
      </>}
    <p className="sign-up-free"><LocalizedText en="Free. No card needed." /></p>
    <Suspense fallback={<p><LocalizedText en="Loading sign-up…" /></p>}><AuthForm mode="sign-up" google={google} /></Suspense>
    <p>
      <LocalizedText en="Already have an account?" />{" "}
      <Link href={signInHref} prefetch={false}><LocalizedText en="Sign in" /></Link>
    </p>
  </div></div>;
}
