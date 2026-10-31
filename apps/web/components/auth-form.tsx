"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNextPath } from "../lib/auth/redirect.mjs";
import { useUiTranslation } from "./localized-text";

const CONFIRMATION_ERRORS: Record<string, string> = {
  "confirmation-link": "That confirmation link is invalid or has expired. Request a new one by signing up again.",
  "missing-code": "That confirmation link was incomplete. Open the most recent link from your email.",
  "missing-token": "That confirmation link was incomplete. Open the most recent link from your email.",
};

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useUiTranslation();
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
    if (!email || !email.includes("@")) return setError(t("Enter a valid email address."));
    if (password.length < 8) return setError(t("Password must be at least 8 characters."));
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
    if (result.error) return setError(t(result.error.message));
    if (mode === "sign-up" && !result.data.session) {
      setMessage(t("Check your email to confirm your account, then sign in."));
      return;
    }
    router.push(nextPath);
    router.refresh();
  }

  return <form className="form-grid" onSubmit={submit} noValidate>
    <div className="field"><label htmlFor="email">{t("Email")}</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
    <div className="field"><label htmlFor="password">{t("Password")}</label><input id="password" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required /><small>{t("Use at least 8 characters.")}</small></div>
    {(error || confirmationError) && <div className="field-error" role="alert">{t(error || confirmationError)}</div>}
    {message && <div className="success-state" role="status">{message}</div>}
    <button className="button" type="submit" disabled={loading}>{loading ? t("Working…") : mode === "sign-in" ? t("Sign in") : t("Create account")}</button>
  </form>;
}


export function SignOutButton() {
  const router = useRouter();
  const t = useUiTranslation();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    const { createSupabaseBrowserClient } = await import("../lib/supabase/browser");
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }

  return <button className="button button-small" onClick={signOut} disabled={loading}>
    {loading ? t("Signing out…") : t("Sign out")}
  </button>;
}
