"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LocalizedText } from "./localized-text";

/**
 * On a phone the full navigation filled the first screen before any of the
 * page showed. Below 700px it now folds behind this button; above that the
 * button is hidden and the navigation is always shown. The state lives on
 * the header as a class so the server-rendered links stay as they are.
 */
export function MobileNavToggle() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // A page change, or a click anywhere else, also closes the account menu,
  // which is a plain <details> and would otherwise stay open across pages.
  useEffect(() => {
    setOpen(false);
    document.querySelectorAll("details.account-menu[open]").forEach((menu) => menu.removeAttribute("open"));
  }, [pathname]);
  useEffect(() => {
    function closeAccountMenu(event: MouseEvent) {
      document.querySelectorAll("details.account-menu[open]").forEach((menu) => {
        if (!menu.contains(event.target as Node)) menu.removeAttribute("open");
      });
    }
    document.addEventListener("click", closeAccountMenu);
    return () => document.removeEventListener("click", closeAccountMenu);
  }, []);
  useEffect(() => {
    document.querySelector(".topbar")?.classList.toggle("nav-open", open);
  }, [open]);

  return (
    <button type="button" className="nav-toggle" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen((value) => !value)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
      </svg>
      <span className="visually-hidden"><LocalizedText en="Menu" /></span>
    </button>
  );
}
