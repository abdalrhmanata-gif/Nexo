import Link from "next/link";
import { ForgotPasswordForm } from "../../../components/auth-form";

export default function ForgotPasswordPage() {
  return <div className="container"><div className="form">
    <p className="eyebrow">Account recovery</p><h1 className="detail-title">Reset your password.</h1>
    <p className="detail-intent">We&apos;ll email you a secure link to choose a new password.</p>
    <ForgotPasswordForm />
    <p><Link href="/auth/sign-in">Back to sign in</Link></p>
  </div></div>;
}
