import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "../../../components/auth-form";
import { LocalizedText } from "../../../components/localized-text";

export default function SignUpPage() {
  return <div className="container"><div className="form">
    <p className="eyebrow"><LocalizedText en="Get started" /></p><h1 className="detail-title"><LocalizedText en="Create your account." /></h1>
    <p className="detail-intent"><LocalizedText en="Your workspace and missions are private to you." /></p>
    <Suspense fallback={<p><LocalizedText en="Loading sign-up…" /></p>}><AuthForm mode="sign-up" /></Suspense>
    <p><LocalizedText en="Already have an account?" /> <Link href="/auth/sign-in"><LocalizedText en="Sign in" /></Link>.</p>
  </div></div>;
}
