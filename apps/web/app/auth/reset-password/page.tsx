"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ResetPasswordForm } from "../../../components/auth-form";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("error_code");
  const description = searchParams.get("error_description") ?? "";
  const expired = code === "otp_expired" || /expired|invalid/i.test(description);
  return <>
    {expired && <div className="field-error" role="alert">This password reset link has expired or has already been used. Request a new reset email and open the newest link promptly.</div>}
    <ResetPasswordForm />
  </>;
}

export default function ResetPasswordPage() {
  return <div className="container"><div className="form">
    <p className="eyebrow">Account recovery</p><h1 className="detail-title">Choose a new password.</h1>
    <p className="detail-intent">Use a password you haven&apos;t used elsewhere.</p>
    <Suspense fallback={<p>Loading password reset…</p>}><ResetPasswordContent /></Suspense>
    <p><Link href="/auth/forgot-password">Request a new reset link</Link></p>
    <p><Link href="/auth/sign-in">Back to sign in</Link></p>
  </div></div>;
}
