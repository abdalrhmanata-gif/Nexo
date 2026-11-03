export const MAX_MISSION_JSON_BODY_BYTES: number;
export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };
export function readBoundedJsonBody(request: Request, maxBytes?: number): Promise<BoundedJsonResult>;
