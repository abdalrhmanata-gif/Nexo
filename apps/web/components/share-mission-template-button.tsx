"use client";

import { useState } from "react";
import { LocalizedText } from "./localized-text";

type ShareMessage = "copied" | "shared" | "manual" | "";

export function ShareMissionTemplateButton({ templateId, title }: { templateId: string; title: string }) {
  const [message, setMessage] = useState<ShareMessage>("");
  const [shareUrl, setShareUrl] = useState("");

  async function shareTemplate() {
    const url = new URL(`/try?template=${encodeURIComponent(templateId)}`, window.location.origin).toString();
    setShareUrl(url);
    setMessage("");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `ZAVQERA · ${title}`,
          text: "Start with this mission template and tailor it to your goal.",
          url,
        });
        setMessage("shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage("copied");
    } catch {
      setMessage("manual");
    }
  }

  return <div className="template-share">
    <button className="button button-small button-quiet" type="button" onClick={shareTemplate}>
      <LocalizedText en="Share template" nb="Del mal" ar="شارك القالب" />
    </button>
    {message === "copied" && <p className="share-feedback" role="status"><LocalizedText en="Link copied. Share it with anyone to try this template." nb="Lenken er kopiert. Del den slik at andre kan prøve malen." ar="تم نسخ الرابط. شاركه ليجرّب الآخرون هذا القالب." /></p>}
    {message === "shared" && <p className="share-feedback" role="status"><LocalizedText en="Share sheet opened." nb="Delingsmenyen er åpnet." ar="تم فتح قائمة المشاركة." /></p>}
    {message === "manual" && <p className="share-feedback" role="status"><LocalizedText en="Copy this link to share the template." nb="Kopier lenken for å dele malen." ar="انسخ هذا الرابط لمشاركة القالب." /></p>}
    {message !== "" && <input className="template-share-url" aria-label="Shareable template link" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />}
  </div>;
}
