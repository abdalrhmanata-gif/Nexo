"use client";

import { useUiTranslation } from "./localized-text";

export function LocalizedSearchInput({
  id,
  name,
  defaultValue,
  maxLength,
}: {
  id: string;
  name: string;
  defaultValue: string;
  maxLength: number;
}) {
  const t = useUiTranslation();
  return (
    <input
      id={id}
      name={name}
      type="search"
      defaultValue={defaultValue}
      maxLength={maxLength}
      placeholder={t("Search missions…")}
      autoComplete="off"
    />
  );
}
