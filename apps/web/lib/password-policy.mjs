import { createHash } from "node:crypto";

export async function checkPasswordPolicy(password, fetchImpl = fetch) {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: {
      "Add-Padding": "true",
      "User-Agent": "ZAVQERA/1.0 password-policy",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error("PASSWORD_POLICY_UNAVAILABLE");
  }

  const body = await response.text();
  for (const line of body.split(/\r?\n/)) {
    const [candidate, countText] = line.split(":", 2);
    if (candidate?.trim().toUpperCase() === suffix && Number(countText) > 0) {
      return { allowed: false, reason: "COMPROMISED_PASSWORD" };
    }
  }

  return { allowed: true };
}
