"use client";

import { useEffect, useRef } from "react";

/**
 * Presses a form's submit button once, on arrival. Used only where the server
 * has already established that the person asked for this (see
 * lib/start-plan-token.ts). The button stays on the page for anyone without
 * JavaScript. A repeat is harmless: the action deletes the cookie that
 * enabled this, and finds a plan saved minutes ago instead of saving it twice.
 */
export function AutoSubmit({ formId }: { formId: string }) {
  const pressed = useRef(false);
  useEffect(() => {
    if (pressed.current) return;
    pressed.current = true;
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }, [formId]);
  return null;
}
