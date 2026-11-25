export type StepOwnerEditor = { id: string; email: string; isYou: boolean };
export type StepOwners = { canAssign: boolean; editors: StepOwnerEditor[]; owners: Record<string, string> };
export type AssignedStep = { actionId: string; title: string; status: string; missionId: string; missionName: string };

export declare function stepTakesOwner(status: string): boolean;
export declare function parseStepOwners(payload: unknown, youId: string | null | undefined): StepOwners | null;
export declare function ownersInUse(stepOwners: StepOwners | null): boolean;
export declare function ownerName(editor: StepOwnerEditor | null, t?: (text: string) => string): string;
export declare function ownerOf(stepOwners: StepOwners | null, actionId: string): StepOwnerEditor | null;
export declare function assignedToYou(rows: AssignedStep[] | null | undefined, visibleMissionIds: Iterable<string>): { here: AssignedStep[]; elsewhere: number };
export declare function ownerRefusal(message?: string): string;
