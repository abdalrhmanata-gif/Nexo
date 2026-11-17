/**
 * The ZAVQERA mark: a Z whose last stroke rises into a check. A goal, the
 * steps that carry it, and the result you can verify. Drawn in the brand
 * teal so it follows the light and dark themes; app/icon.svg is the same
 * drawing with fixed colours for the browser tab.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--teal)" />
      <path d="M9 9.5h13.5L10 22.5h7.2l6.3-7.6" fill="none" stroke="#fff" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
