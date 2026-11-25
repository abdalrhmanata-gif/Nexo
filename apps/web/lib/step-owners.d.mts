export type StepOwnerEditor = { id: string; email: string; isYou: boolean };
export type StepOwners = { canAssign: boolean; isCreator: boolean; role: string | null; creatorEmail: string; missionObjective: string; editors: StepOwnerEditor[]; owners: Record<string, string> };
export type MissionPermissions = { known: boolean; canEdit: boolean; isCreator: boolean; canDelete: boolean };
export type AssignedStep = { actionId: string; title: string; status: string; missionId: string; missionName: string };

export declare function stepTakesOwner(status: string): boolean;
export declare function parseStepOwners(payload: unknown, youId: string | null | undefined): StepOwners | null;
export declare function ownersInUse(stepOwners: StepOwners | null): boolean;
export declare function ownerName(editor: StepOwnerEditor | null, t?: (text: string) => string): string;
export declare function ownerOf(stepOwners: StepOwners | null, actionId: string): StepOwnerEditor | null;
export declare function assignedToYou(rows: AssignedStep[] | null | undefined, visibleMissionIds: Iterable<string>): (AssignedStep & { href: string })[];
export declare function missionOpenPath(missionId: string): string;
export declare function missionPermissions(access: StepOwners | null): MissionPermissions;
export declare function creatorName(access: StepOwners | null, t?: (text: string) => string): string;
export declare function ownerRefusal(message?: string): string;
