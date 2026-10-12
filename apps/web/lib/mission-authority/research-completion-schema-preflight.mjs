export const RESEARCH_COMPLETION_SCHEMA_PROBE_UUID = "zavqera-schema-probe-invalid-uuid";

export function isResearchCompletionSchemaProbeError(error) {
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  if (error.code !== "22P02" || typeof error.message !== "string") return false;
  return /invalid input syntax for type uuid/i.test(error.message)
    && error.message.includes(RESEARCH_COMPLETION_SCHEMA_PROBE_UUID);
}
