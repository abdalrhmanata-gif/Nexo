export const AI_QUOTA_ENFORCEMENT_READY = false;
export function quotaEnforcementError(): { error: string } {
  return { error: "ai_quota_enforcement_not_configured" };
}
