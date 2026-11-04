import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "../../../components/auth-form";
import { LocalizedText } from "../../../components/localized-text";

export default function SignInPage() {
  return <div className="container"><div className="form">
    <p className="eyebrow"><LocalizedText en="Welcome back" /></p><h1 className="detail-title"><LocalizedText en="Sign in." /></h1>
    <p className="detail-intent"><LocalizedText en="Access your workspace and keep authority bounded." /></p>
    <Suspense fallback={<p><LocalizedText en="Loading sign-in…" /></p>}><AuthForm mode="sign-in" /></Suspense>
    <p><Link href="/auth/forgot-password"><LocalizedText en="Forgot your password?" /></Link></p>
    <p><LocalizedText en="Need an account?" /> <Link href="/auth/sign-up"><LocalizedText en="Create one" /></Link>.</p>
  </div></div>;
}
