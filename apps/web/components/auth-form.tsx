"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (result.error) return setError(result.error.message);
    if (mode === "sign-up" && !result.data.session) {
      setMessage("Check your email to confirm your account, then sign in.");
      return;
    }
    router.push(searchParams.get("next") || "/app");
    router.refresh();
  }

  return <form className="form-grid" onSubmit={submit} noValidate>
    <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
    <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required /><small>Use at least 8 characters.</small></div>
    {error && <div className="field-error" role="alert">{error}</div>}
    {message && <div className="success-state" role="status">{message}</div>}
    <button className="button" type="submit" disabled={loading}>{loading ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
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
