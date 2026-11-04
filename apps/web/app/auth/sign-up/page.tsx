import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "../../../components/auth-form";

export default function SignUpPage() {
  return <div className="container"><div className="form">
    <p className="eyebrow">Get started</p><h1 className="detail-title">Create your account.</h1>
    <p className="detail-intent">Your workspace and missions are private to you.</p>
    <Suspense fallback={<p>Loading sign-up…</p>}><AuthForm mode="sign-up" /></Suspense>
    <p>Already have an account? <Link href="/auth/sign-in">Sign in</Link>.</p>
  </div></div>;
}
