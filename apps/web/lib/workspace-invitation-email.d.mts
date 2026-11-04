export type WorkspaceInvitationEmailInput = {
  email: string;
  role: "admin" | "member" | "viewer";
  inviteUrl: string;
  expiresAt: string;
  idempotencyKey: string;
};

export type WorkspaceInvitationEmailResult =
  | { ok: true }
  | { ok: false; reason: "EMAIL_NOT_CONFIGURED" | "EMAIL_PROVIDER_REJECTED" };

export declare function sendWorkspaceInvitationEmail(
  input: WorkspaceInvitationEmailInput,
  options: { apiKey?: string; from?: string; fetchImpl?: typeof fetch },
): Promise<WorkspaceInvitationEmailResult>;
