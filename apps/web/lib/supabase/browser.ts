"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./config";

export function createSupabaseBrowserClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local.");
  }
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
