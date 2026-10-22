import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "../../../components/auth-form";

export default function SignInPage() {
  return <div className="container"><div className="form">
    <p className="eyebrow">Welcome back</p><h1 className="detail-title">Sign in.</h1>
    <p className="detail-intent">Access your workspace and keep authority bounded.</p>
    <Suspense fallback={<p>Loading sign-in…</p>}><AuthForm mode="sign-in" /></Suspense>
    <p>Need an account? <Link href="/auth/sign-up">Create one</Link>.</p>
  </div></div>;
}
