"use client";

import Link from "next/link";
import { Suspense } from "react";
import { ResetPasswordForm } from "../../../components/auth-form";

export default function ResetPasswordPage() {
  return <div className="container"><div className="form">
    <p className="eyebrow">Account recovery</p><h1 className="detail-title">Choose a new password.</h1>
    <p className="detail-intent">Use a password you haven&apos;t used elsewhere.</p>
    <Suspense fallback={<p>Loading password reset…</p>}><ResetPasswordForm /></Suspense>
    <p><Link href="/auth/sign-in">Back to sign in</Link></p>
  </div></div>;
}
