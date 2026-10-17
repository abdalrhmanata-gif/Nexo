"use client";

import { useEffect } from "react";

export function MissionSearchEnhancements() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const input = document.getElementById("mission-search-input") as HTMLInputElement | null;
      if (!input) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.focus();
        input.select();
        return;
      }

      if (event.key === "Escape" && document.activeElement === input && input.value) {
        event.preventDefault();
        input.value = "";
        input.form?.requestSubmit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <span className="mission-search-shortcut" aria-hidden="true">
    <kbd className="shortcut-key"><span className="shortcut-mac">⌘</span><span className="shortcut-pc">Ctrl</span><span>K</span></kbd>
  </span>;
}
