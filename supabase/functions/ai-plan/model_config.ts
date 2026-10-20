/** Resolve an explicitly configured provider model. No fallback is permitted. */
export function resolveConfiguredModel(value: string | undefined): string | null {
  const model = value?.trim();
  return model ? model : null;
}
