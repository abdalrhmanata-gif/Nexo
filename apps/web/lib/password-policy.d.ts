export type PasswordPolicyResult =
  | { allowed: true }
  | { allowed: false; reason: "COMPROMISED_PASSWORD" };

export declare function checkPasswordPolicy(
  password: string,
  fetchImpl?: typeof fetch,
): Promise<PasswordPolicyResult>;
