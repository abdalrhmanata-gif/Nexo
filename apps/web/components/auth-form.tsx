"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";
import { safeNextPath } from "../lib/auth/redirect.mjs";

const CONFIRMATION_ERRORS: Record<string, string> = {
  "confirmation-link": "That confirmation link is invalid or has expired. Request a new one by signing up again.",
  "missing-code": "That confirmation link was incomplete. Open the most recent link from your email.",
  "missing-token": "That confirmation link was incomplete. Open the most recent link from your email.",
};

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
    const supabase = createSupabaseBrowserClient();
    const nextPath = safeNextPath(searchParams.get("next"));
    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
    setLoading(false);
    if (result.error) return setError(mode === "sign-in" ? "Invalid email or password." : "We could not create the account. Check your details and try again.");
    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your email to confirm your account, then sign in.");
      return;
    }
    router.push(nextPath);
    router.refresh();
  }

  return <form className="form-grid" onSubmit={submit} noValidate>
    <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
    <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required /><small>Use at least 8 characters.</small></div>
    {(error || confirmationError) && <div className="field-error" role="alert">{error || confirmationError}</div>}
    {message && <div className="success-state" role="status">{message}</div>}
    <button className="button" type="submit" disabled={loading}>{loading ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
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
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin;
    const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`;
    const { error: requestError } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (requestError) return setError("We couldn't send a reset email. Please try again.");
    setMessage("If an account exists for this email, a password reset link will arrive shortly. Check your inbox and spam folder.");
  }

  return <form className="form-grid" onSubmit={submit} noValidate>
    <div className="field"><label htmlFor="reset-email">Email</label><input id="reset-email" name="email" type="email" autoComplete="email" required /></div>
    {error && <div className="field-error" role="alert">{error}</div>}
    {message && <div className="success-state" role="status">{message}</div>}
    <button className="button" type="submit" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</button>
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
    const { error: updateError } = await createSupabaseBrowserClient().auth.updateUser({ password });
    setLoading(false);
    if (updateError) return setError("We couldn't update your password. Request a new reset link and try again.");
    setMessage("Password updated. Redirecting to your workspace…");
    router.replace("/app");
    router.refresh();
  }

  return <form className="form-grid" onSubmit={submit} noValidate>
    <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required /><small>Use at least 8 characters.</small></div>
    <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></div>
    {error && <div className="field-error" role="alert">{error}</div>}
    {message && <div className="success-state" role="status">{message}</div>}
    <button className="button" type="submit" disabled={loading}>{loading ? "Updating…" : "Update password"}</button>
  </form>;
}

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function signOut() {
    setLoading(true);
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }
  return <button className="button button-small" onClick={signOut} disabled={loading}>{loading ? "Signing out…" : "Sign out"}</button>;
}
