export type RepeatFrequency = "daily" | "weekly" | "monthly";
export type RepeatRule = { frequency: RepeatFrequency; weekdays: number[] | null; weekday: number | null; monthDay: number | null; timeZone: string };
export type Repeat = { id: string; frequency: RepeatFrequency; weekdays: number[]; weekday: number | null; monthDay: number | null; timeZone: string; createdBy: string; sourceMissionId: string | null };
export declare const REPEAT_FREQUENCIES: readonly RepeatFrequency[];
export declare const WEEKDAYS: readonly { iso: number; en: string }[];
export declare function repeatAllowance(plan: string | null | undefined): number;
export declare function isTimeZoneName(value: unknown): boolean;
export declare function parseRepeatForm(fields: (name: string) => string, all: (name: string) => string[]):
  { ok: true; rule: RepeatRule } | { ok: false; reason: string };
export declare function repeatErrorReason(message: unknown): string;
export declare const REPEAT_NOTICES: Readonly<Record<string, string>>;
export declare function describeRepeat(repeat: Pick<Repeat, "frequency" | "weekdays" | "weekday" | "monthDay"> | null):
  { key: string; values: Record<string, string>; days?: string[]; day?: string } | null;
