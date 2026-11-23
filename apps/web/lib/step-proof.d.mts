import type { MissionAction } from "./view-models";

export declare const PROOF_NOTE_MAX: number;
export declare const PROOF_URL_MAX: number;

export declare function normaliseProof(input?: { note?: unknown; url?: unknown }):
  | { ok: true; note: string | null; url: string | null }
  | { ok: false; error: string };

type ProofFields = Pick<MissionAction, "title" | "status" | "evidenceNote" | "evidenceUrl">;

export declare function hasProof(action: Partial<ProofFields> | null | undefined): boolean;
export declare function proofLinkLabel(url: string): string;
export declare function proofCitation(action: ProofFields): string;
export declare function evidenceFromProof(actions?: ProofFields[]): string;
