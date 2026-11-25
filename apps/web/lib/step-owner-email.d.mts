export declare function shouldEmailStepOwner(input: { assigneeId: string | null | undefined; actorId: string | null | undefined }): boolean;
export declare function stepOwnerIdempotencyKey(actionId: string, assigneeId: string): string;
export declare function stepOwnerLink(origin: string, missionId: string): string;
export declare function stepOwnerEmail(input: { assignerEmail: string; stepTitle: string; missionName: string; link: string }): { subject: string; text: string; html: string };
