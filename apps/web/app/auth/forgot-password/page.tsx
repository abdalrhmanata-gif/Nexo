import Link from "next/link";
import { ForgotPasswordForm } from "../../../components/auth-form";
import { LocalizedText } from "../../../components/localized-text";

export default function ForgotPasswordPage() {
  return <div className="container"><div className="form">
    <p className="eyebrow"><LocalizedText en="Account recovery" /></p><h1 className="detail-title"><LocalizedText en="Reset your password." /></h1>
    <p className="detail-intent"><LocalizedText en="We’ll email you a secure link to choose a new password." /></p>
    <ForgotPasswordForm />
    <p><Link href="/auth/sign-in"><LocalizedText en="Back to sign in" /></Link></p>
  </div></div>;
}
