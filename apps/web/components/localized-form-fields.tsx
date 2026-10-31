"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useUiTranslation } from "./localized-text";

type LocalizedInputProps = Omit<ComponentPropsWithoutRef<"input">, "placeholder"> & { placeholder: string };
type LocalizedTextareaProps = Omit<ComponentPropsWithoutRef<"textarea">, "placeholder"> & { placeholder: string };

export function LocalizedInput({ placeholder, ...props }: LocalizedInputProps) {
  const t = useUiTranslation();
  return <input {...props} placeholder={t(placeholder)} />;
}

export function LocalizedTextarea({ placeholder, ...props }: LocalizedTextareaProps) {
  const t = useUiTranslation();
  return <textarea {...props} placeholder={t(placeholder)} />;
}
