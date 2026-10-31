"use client";

import { useUiLanguage } from "./localized-text";
import { formatUiAbsoluteDate, formatUiRelativeDate } from "../lib/localized-date.mjs";

export function LocalizedFollowUpDate({ relative, absolute }: { relative: string; absolute: string }) {
  const language = useUiLanguage();
  return <>{formatUiRelativeDate(relative, language)} · {formatUiAbsoluteDate(absolute, language)}</>;
}
