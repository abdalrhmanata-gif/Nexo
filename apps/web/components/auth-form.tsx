"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNextPath } from "../lib/auth/redirect.mjs";
import { LocalizedText } from "./localized-text";
import { authErrorMessage } from "../lib/auth-errors.mjs";

// Messages are held in state as their English source text and rendered through
// LocalizedText, which resolves them against the dictionaries. That keeps the
// forms translatable without threading a translator through every setState.
const CONFIRMATION_ERRORS: Record<string, string> = {
  "confirmation-link": "That confirmation link is invalid or has expired. Request a new one by signing up again.",
  "missing-code": "That confirmation link was incomplete. Open the most recent link from your email.",
  "missing-token": "That confirmation link was incomplete. Open the most recent link from your email.",
};

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <div className="field-error" role="alert"><LocalizedText en={message} /></div>;
}

function FormMessage({ message }: { message: string }) {
  if (!message) return null;
  return <div className="success-state" role="status"><LocalizedText en={message} /></div>;
}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmationError = CONFIRMATION_ERRORS[searchParams.get("error") ?? ""] ?? "";
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    const { createSupabaseBrowserClient } = await import("../lib/supabase/browser");
    const supabase = createSupabaseBrowserClient();
    const nextPath = safeNextPath(searchParams.get("next"));
    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
    setLoading(false);
    // The provider's sentence is never shown: it is English, written for
    // developers, and invisible to every translation audit. Its code picks
    // one of ours.
    if (result.error) return setError(authErrorMessage(result.error));
    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your email to confirm your account, then sign in.");
      return;
    }
    router.push(nextPath);
    router.refresh();
  }

  return <form className="form-grid" onSubmit={submit} noValidate>
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
    <FormMessage message={message} />
    <button className="button" type="submit" disabled={loading}>
      {loading ? <LocalizedText en="Working…" /> : mode === "sign-in" ? <LocalizedText en="Sign in" /> : <LocalizedText en="Create account" />}
    </button>
  </form>;
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
    if (updateError) return setError("We couldn't update your password. Request a new reset link and try again.");
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
