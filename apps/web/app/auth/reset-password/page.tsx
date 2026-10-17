"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ResetPasswordForm } from "../../../components/auth-form";
import { LocalizedText } from "../../../components/localized-text";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("error_code");
  const description = searchParams.get("error_description") ?? "";
  const expired = code === "otp_expired" || /expired|invalid/i.test(description);
  return <>
    {expired && <div className="field-error" role="alert"><LocalizedText en="This password reset link has expired or has already been used. Request a new reset email and open the newest link promptly." /></div>}
    <ResetPasswordForm />
  </>;
}

export default function ResetPasswordPage() {
  return <div className="container"><div className="form">
    <p className="eyebrow"><LocalizedText en="Account recovery" /></p><h1 className="detail-title"><LocalizedText en="Choose a new password." /></h1>
    <p className="detail-intent"><LocalizedText en="Use a password you haven't used elsewhere." /></p>
    <Suspense fallback={<p><LocalizedText en="Loading password reset…" /></p>}><ResetPasswordContent /></Suspense>
    <p><Link href="/auth/forgot-password"><LocalizedText en="Request a new reset link" /></Link></p>
    <p><Link href="/auth/sign-in"><LocalizedText en="Back to sign in" /></Link></p>
  </div></div>;
}
