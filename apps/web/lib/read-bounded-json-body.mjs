/**
 * Read a JSON request body with a streamed byte ceiling.
 * The limit is enforced even when Content-Length is absent or incorrect.
 */
export const MAX_MISSION_JSON_BODY_BYTES = 160_000;

/**
 * @typedef {{ ok: true, value: unknown }} BoundedJsonSuccess
 * @typedef {{ ok: false, status: 400 | 413, error: string }} BoundedJsonFailure
 * @typedef {BoundedJsonSuccess | BoundedJsonFailure} BoundedJsonResult
 */

/**
 * @param {Request} request
 * @param {number} [maxBytes]
 * @returns {Promise<BoundedJsonResult>}
 */
export async function readBoundedJsonBody(request, maxBytes = MAX_MISSION_JSON_BODY_BYTES) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      return { ok: false, status: 400, error: "Invalid Content-Length." };
    }
    if (parsedLength > maxBytes) {
      return { ok: false, status: 413, error: "Request body is too large." };
    }
  }

  if (!request.body) {
    return { ok: false, status: 400, error: "A JSON request body is required." };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, error: "Request body is too large." };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "Request body could not be read." };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Request body must be valid UTF-8 JSON." };
  }
}
