export type JsonBodyReadResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "invalid_json" };

export function readJsonBody(
  request: Request,
  maxBytes?: number,
): Promise<JsonBodyReadResult>;
