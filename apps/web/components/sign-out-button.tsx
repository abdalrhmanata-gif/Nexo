"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    {loading ? "Signing out…" : "Sign out"}
  </button>;
}
