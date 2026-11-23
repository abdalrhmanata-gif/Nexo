"use client";

import { useEffect, useState } from "react";
import { fill, useTranslate } from "./localized-text";

/**
 * Shown while an AI request runs. A plan or a brief takes 10–20 seconds, and
 * a button that only changes its label for that long reads as broken: people
 * tapped again, or left. A moving bar and a counting clock say it is working
 * and roughly how long to wait.
 */
export function AiProgress() {
  const t = useTranslate();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="ai-progress" role="status" aria-live="polite">
      <div className="ai-progress-bar" aria-hidden="true"><span /></div>
      <p>
        <strong>{fill(t("Working… {seconds} s"), { seconds })}</strong>{" "}
        {t("This usually takes 10–20 seconds. Keep this page open.")}
      </p>
    </div>
  );
}
