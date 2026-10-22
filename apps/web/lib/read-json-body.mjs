const DEFAULT_MAX_JSON_BYTES = 16 * 1024;

export async function readJsonBody(request, maxBytes = DEFAULT_MAX_JSON_BYTES) {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength.trim()) &&
    Number(contentLength) > maxBytes
  ) {
    return { ok: false, reason: "too_large" };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, reason: "invalid_json" };

  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The body is already rejected; cancellation failure changes no decision.
        }
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(json) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
