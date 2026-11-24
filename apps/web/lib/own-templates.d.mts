export type OwnTemplateContent = { name: string; intent: string; criteria: string[]; actions: string[] };
export type TemplateFromMissionResult =
  | { ok: true; template: OwnTemplateContent }
  | { ok: false; reason: "no-name" | "no-steps" | "too-many-steps" };

export declare const OWN_TEMPLATE_PLANS: readonly string[];
export declare const OWN_TEMPLATE_LIMIT: number;
export declare const OWN_TEMPLATE_BOUNDS: Readonly<{ name: number; intent: number; criteria: number; criterion: number; actions: number; action: number }>;
export declare function hasOwnTemplates(plan: unknown): boolean;
export declare function cleanTemplateName(value: unknown): string;
export declare function isTemplateId(value: unknown): value is string;
export declare function templateFromMission(
  mission: { name?: string; intent?: string; criteria?: string[]; actions?: { title: string; status: string }[] } | null | undefined,
  name?: string,
): TemplateFromMissionResult;
export declare function missionFromTemplate(template: { name: string; intent?: string; criteria?: string[]; actions?: string[] }): { objective: string; actions: string[] };
