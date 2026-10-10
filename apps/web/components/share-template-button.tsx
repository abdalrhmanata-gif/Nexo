"use client";

import { useState } from "react";
import { LocalizedText } from "./localized-text";

export function ShareTemplateButton({ templateId, title }: { templateId: string; title: string }) {
  const [message, setMessage] = useState("");
  function recordShare() {
    // Event-only signal for signed-in users; no prompts, goal text, or recipients are sent.
    void fetch("/api/product-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "template_shared", template_id: templateId }),
    }).catch(() => undefined);
  }
  async function share() {
    const url = new URL("/try", window.location.origin);
    url.searchParams.set("template", templateId);
    const shareTitle = `Try this ZAVQERA mission: ${title}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: shareTitle, text: "Start with this mission template and make it your own.", url: url.toString() });
        setMessage("Shared");
        recordShare();
        return;
      }
      await navigator.clipboard.writeText(url.toString());
      setMessage("Link copied");
        recordShare();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url.toString());
        setMessage("Link copied");
        recordShare();
      } catch {
        setMessage("Could not share. Copy the page URL from your browser.");
      }
    }
  }
  return <span className="template-share-control">
    <button type="button" className="button button-quiet" onClick={() => void share()}><LocalizedText en="Share template" nb="Del mal" ar="شارك القالب" /></button>
    {message && <span className="action-hint" role="status"><LocalizedText en={message} /></span>}
  </span>;
}
