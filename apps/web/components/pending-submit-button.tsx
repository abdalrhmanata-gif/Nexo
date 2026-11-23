"use client";

import { useFormStatus } from "react-dom";
import { useTranslate } from "./localized-text";

/**
 * A submit button that cannot be pressed twice. Creating a mission takes a
 * few seconds; a second tap in that time created a second, identical mission
 * (the owner's workspace had two "reise" and two "fornye pass mitt").
 */
export function PendingSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const t = useTranslate();
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={pending} aria-busy={pending}>{pending ? t(pendingLabel) : t(label)}</button>;
}
