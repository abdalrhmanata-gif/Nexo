// Intentionally empty until a real provider adapter has passed security review.
// Never select or construct a provider adapter from request-supplied code/config.
const TRUSTED_DISPATCH_ADAPTERS = Object.freeze({});

export function resolveTrustedDispatchAdapter(audience) {
  if (typeof audience !== "string" || !audience.trim()) return null;
  return Object.hasOwn(TRUSTED_DISPATCH_ADAPTERS, audience)
    ? TRUSTED_DISPATCH_ADAPTERS[audience]
    : null;
}
