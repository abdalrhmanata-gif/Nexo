"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNextPath } from "../lib/auth/redirect.mjs";
import { LocalizedText, useTranslate } from "./localized-text";
import { fill } from "../lib/i18n";
import { authErrorMessage, passwordUpdateErrorMessage } from "../lib/auth-errors.mjs";

// Messages are held in state as their English source text and rendered through
// LocalizedText, which resolves them against the dictionaries. That keeps the
// forms translatable without threading a translator through every setState.
const CONFIRMATION_ERRORS: Record<string, string> = {
  "confirmation-link": "That confirmation link is invalid or has expired. Request a new one by signing up again.",
  "missing-code": "That confirmation link was incomplete. Open the most recent link from your email.",
  "missing-token": "That confirmation link was incomplete. Open the most recent link from your email.",
  google: "Google sign-in did not finish. Try again, or use your email and a password.",
};

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <div className="field-error" role="alert"><LocalizedText en={message} /></div>;
}

function FormMessage({ message }: { message: string }) {
  if (!message) return null;
  return <div className="success-state" role="status"><LocalizedText en={message} /></div>;
}

/** Where a confirmation link should bring the person back to. */
function confirmationRedirect(nextPath: string) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

const RESEND_WAIT_SECONDS = 60;

/**
 * "Send the email again", with the wait the provider imposes between sends
 * shown as a countdown instead of an error after the press.
 */
function ResendConfirmation({ email, nextPath, waitFirst }: { email: string; nextPath: string; waitFirst: boolean }) {
  const t = useTranslate();
  const [wait, setWait] = useState(waitFirst ? RESEND_WAIT_SECONDS : 0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function resend() {
    setSending(true);
    setError("");
    setSent(false);
    const { createSupabaseBrowserClient } = await import("../lib/supabase/browser");
    const { error: resendError } = await createSupabaseBrowserClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: confirmationRedirect(nextPath) },
    });
    setSending(false);
    if (resendError) return setError(authErrorMessage(resendError));
    setSent(true);
    setWait(RESEND_WAIT_SECONDS);
  }

  return <div className="resend-confirmation">
    <FormError message={error} />
    <FormMessage message={sent ? "Sent again. Open the newest email; earlier links stop working." : ""} />
    <button className="button button-quiet" type="button" onClick={resend} disabled={sending || wait > 0}>
      {sending ? t("Sending…") : wait > 0 ? fill(t("Send the email again in {seconds} s"), { seconds: wait }) : t("Send the email again")}
    </button>
  </div>;
}

/** After sign-up: where the link went, what opening it does, and what to do if it is not there. */
function CheckYourEmail({ email, nextPath, onReset }: { email: string; nextPath: string; onReset: () => void }) {
  const t = useTranslate();
  const [before, after] = t("We sent a confirmation link to {email}.").split("{email}");
  const hasPlan = nextPath.startsWith("/app/start");
  return <div className="check-email" role="status">
    <h2><LocalizedText en="Check your inbox" /></h2>
    <p>{before}<bdi className="check-email-address">{email}</bdi>{after ?? ""}</p>
    <p>{hasPlan
      ? <LocalizedText en="Open it and your plan is saved and opened straight away, on this device or another." />
      : <LocalizedText en="Open it and your workspace opens straight away, on this device or another." />}</p>
    <p className="action-hint"><LocalizedText en="It can take a minute. If it is not there, look in spam or promotions." /></p>
    <div className="check-email-actions">
      <ResendConfirmation email={email} nextPath={nextPath} waitFirst />
      <button className="button button-quiet" type="button" onClick={onReset}><LocalizedText en="Use a different email" /></button>
    </div>
  </div>;
}

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.87-3c-1.08.72-2.45 1.15-4.08 1.15-3.13 0-5.79-2.11-6.74-4.96H1.27v3.1A12 12 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.26 14.27A7.2 7.2 0 0 1 4.88 12c0-.79.14-1.55.38-2.27v-3.1H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.37l3.99-3.1Z" />
    <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.63l3.99 3.1C6.21 6.88 8.87 4.77 12 4.77Z" />
  </svg>;
}

/**
 * One press instead of a password and a confirmation email. Shown only when
 * the provider is switched on in Supabase (see lib/auth/providers.ts).
 */
function ContinueWithGoogle({ nextPath, onError }: { nextPath: string; onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);
  async function start() {
    setLoading(true);
    onError("");
    const { createSupabaseBrowserClient } = await import("../lib/supabase/browser");
    const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}&via=google` },
    });
    // On success the browser is already leaving for Google.
    if (error) {
      setLoading(false);
      onError("Google sign-in did not finish. Try again, or use your email and a password.");
    }
  }
  return <button className="button button-quiet google-button" type="button" onClick={start} disabled={loading}>
    <GoogleMark /> {loading ? <LocalizedText en="Opening Google…" /> : <LocalizedText en="Continue with Google" />}
  </button>;
}

export function AuthForm({ mode, google = false }: { mode: "sign-in" | "sign-up"; google?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmationError = CONFIRMATION_ERRORS[searchParams.get("error") ?? ""] ?? "";
  const nextPath = safeNextPath(searchParams.get("next"));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [unconfirmed, setUnconfirmed] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setUnconfirmed("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    const { createSupabaseBrowserClient } = await import("../lib/supabase/browser");
    const supabase = createSupabaseBrowserClient();
    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: confirmationRedirect(nextPath),
          // The confirmation email always links to /app (it is a Supabase
          // template), so the place this sign-up was heading is kept on the
          // account and used once the link is opened: lib/auth/landing.ts.
          ...(nextPath !== "/app" ? { data: { pending_next: nextPath } } : {}),
        },
      });
    setLoading(false);
    // The provider's sentence is never shown: it is English, written for
    // developers, and invisible to every translation audit. Its code picks
    // one of ours.
    if (result.error) {
      if (result.error.code === "email_not_confirmed") setUnconfirmed(email);
      return setError(authErrorMessage(result.error));
    }
    if (mode === "sign-up" && !result.data.session) {
      // An address that already has an account gets no email and an empty
      // identity list back; saying "check your inbox" would leave the person
      // waiting for nothing.
      if (result.data.user && Array.isArray(result.data.user.identities) && result.data.user.identities.length === 0) {
        return setError("An account with this email already exists. Sign in instead.");
      }
      setSentTo(email);
      return;
    }
    // Signed in straight away (no confirmation step on this project): the
    // destination is used right here, so it must not linger on the account
    // and send a later sign-in back to the same plan.
    if (mode === "sign-up" && nextPath !== "/app") await supabase.auth.updateUser({ data: { pending_next: null } }).catch(() => undefined);
    router.push(nextPath);
    router.refresh();
  }

  if (sentTo) return <CheckYourEmail email={sentTo} nextPath={nextPath} onReset={() => setSentTo("")} />;

  return <div className="auth-form">
    {google && <>
      <ContinueWithGoogle nextPath={nextPath} onError={setError} />
      <p className="auth-divider"><span><LocalizedText en="or with your email" /></span></p>
    </>}
    <form className="form-grid" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="email"><LocalizedText en="Email" /></label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password"><LocalizedText en="Password" /></label>
        <input id="password" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required />
        <small><LocalizedText en="Use at least 8 characters." /></small>
      </div>
      <FormError message={error || confirmationError} />
      {unconfirmed && <ResendConfirmation email={unconfirmed} nextPath={nextPath} waitFirst={false} />}
      <button className="button" type="submit" disabled={loading}>
        {loading ? <LocalizedText en="Working…" /> : mode === "sign-in" ? <LocalizedText en="Sign in" /> : <LocalizedText en="Create account" />}
      </button>
    </form>
  </div>;
}

export function ForgotPasswordForm() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!email || !email.includes("@")) return setError("Enter a valid email address.");
    setLoading(true);
    const { createSupabaseBrowserClient } = await import("../lib/supabase/browser");
    // Use the origin the reset was requested from. A preview build can have
    // NEXT_PUBLIC_SITE_URL pointing at production; using it here would move the
    // recovery session away from the deployment that started the flow.
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`;
    const { error: requestError } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (requestError) return setError("We couldn't send a reset email. Please try again.");
    // Same answer whether or not the address exists, so the form cannot be used
    // to discover which emails have accounts.
    setMessage("If an account exists for this email, a password reset link will arrive shortly. Check your inbox and spam folder.");
  }

  return <form className="form-grid" onSubmit={submit} noValidate>
    <div className="field">
      <label htmlFor="reset-email"><LocalizedText en="Email" /></label>
      <input id="reset-email" name="email" type="email" autoComplete="email" required />
    </div>
    <FormError message={error} />
    <FormMessage message={message} />
    <button className="button" type="submit" disabled={loading}>
      {loading ? <LocalizedText en="Sending…" /> : <LocalizedText en="Send reset link" />}
    </button>
  </form>;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setLoading(true);
    const { createSupabaseBrowserClient } = await import("../lib/supabase/browser");
    const { error: updateError } = await createSupabaseBrowserClient().auth.updateUser({ password });
    setLoading(false);
    if (updateError) return setError(passwordUpdateErrorMessage(updateError));
    setMessage("Password updated. Redirecting to your workspace…");
    router.replace("/app");
    router.refresh();
  }

  return <form className="form-grid" onSubmit={submit} noValidate>
    <div className="field">
      <label htmlFor="new-password"><LocalizedText en="New password" /></label>
      <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <small><LocalizedText en="Use at least 8 characters." /></small>
    </div>
    <div className="field">
      <label htmlFor="confirm-password"><LocalizedText en="Confirm new password" /></label>
      <input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
    </div>
    <FormError message={error} />
    <FormMessage message={message} />
    <button className="button" type="submit" disabled={loading}>
      {loading ? <LocalizedText en="Updating…" /> : <LocalizedText en="Update password" />}
    </button>
  </form>;
}

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    const { createSupabaseBrowserClient } = await import("../lib/supabase/browser");
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }

  return <button className="button button-small" onClick={signOut} disabled={loading}>
    {loading ? <LocalizedText en="Signing out…" /> : <LocalizedText en="Sign out" />}
  </button>;
}
