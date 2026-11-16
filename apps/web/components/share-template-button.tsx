"use client";

import { useState } from "react";
import { LocalizedText } from "./localized-text";

export function ShareTemplateButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sharing can be cancelled by the user. Clipboard failures are also
      // intentionally silent because the page remains usable without them.
    }
  }

  return (
    <button className="button button-quiet" type="button" onClick={share}>
      {copied ? <LocalizedText en="Link copied" /> : <LocalizedText en="Share this Mission" />}
    </button>
  );
}
