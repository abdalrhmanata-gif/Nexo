"use client";

import { useState } from "react";

/**
 * A link shown in a read-only field with a Copy button. The field stays, so
 * the link can still be selected by hand where the clipboard is not allowed.
 * Labels arrive translated: this component has no words of its own.
 */
export function CopyLinkButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="copy-link">
    <input readOnly value={value} aria-label={label} onFocus={(event) => event.currentTarget.select()} dir="ltr" />
    <button
      type="button"
      className="button button-quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2500);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  </div>;
}
