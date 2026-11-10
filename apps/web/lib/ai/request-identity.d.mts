export type GenerationKind = "planner" | "research";
export declare const GENERATION_KINDS: readonly GenerationKind[];
export declare function requestHashFor(input: {
  kind: GenerationKind;
  model: string;
  system: string;
  user: string;
}): string;
