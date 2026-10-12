// Intentionally empty until a real provider adapter has passed security review.
// Never select or construct a provider adapter from request-supplied code/config.
const TRUSTED_DISPATCH_ADAPTERS = Object.freeze({});

export function hasTrustedProviderAdapterContractShape(audience, adapter) {
  if (typeof audience !== "string" || !audience.trim() || audience.length > 128) return false;
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) return false;
  return adapter.audience === audience
    && typeof adapter.dispatch === "function"
    && typeof adapter.reconcile === "function";
}

export function resolveTrustedDispatchAdapter(audience) {
  if (typeof audience !== "string" || !audience.trim()) return null;
  if (!Object.hasOwn(TRUSTED_DISPATCH_ADAPTERS, audience)) return null;
  const adapter = TRUSTED_DISPATCH_ADAPTERS[audience];
  if (!hasTrustedProviderAdapterContractShape(audience, adapter)) return null;
  return Object.freeze(adapter);
}
