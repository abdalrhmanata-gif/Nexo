import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/supabase/server";

export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/auth/sign-in?next=%2Fapp");
  return children;
}
