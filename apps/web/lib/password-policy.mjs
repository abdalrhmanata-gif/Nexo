import { createHash } from "node:crypto";

export type PasswordPolicyResult =
  | { allowed: true }
  | { allowed: false; reason: "COMPROMISED_PASSWORD" };

export async function checkPasswordPolicy(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PasswordPolicyResult> {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: {
      "Add-Padding": "true",
      "User-Agent": "ZAVQERA/1.0 password-policy",
    },
    cache: "no-store",
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
