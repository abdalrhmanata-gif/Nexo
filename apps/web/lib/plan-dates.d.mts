export type DueDate = { dueOn: string; basis: "law" | null };
export type CalendarFeedRow = {
  mission_id: string;
  objective: string | null;
  target_date: string | null;
  action_id: string | null;
  action_title: string | null;
  action_status: string | null;
  due_on: string | null;
  basis: string | null;
  action_position: number | null;
};
type DatedAction = { id: string; status: string };

export declare const CALENDAR_LIMITS: Readonly<{ free: number; plus: number; pro: null; scale: null }>;
export declare function calendarLimit(plan: string): number | null;
export declare function isPlanDate(value: unknown): value is string;
export declare function todayIn(timeZone?: string | null, now?: Date): string;
export declare function daysBetween(fromIso: string, toIso: string): number;
export declare function addDays(iso: string, days: number): string;
export declare function countdown(targetIso: string, todayIso: string): { kind: "future" | "today" | "past"; days: number };
export declare function lateSteps<T extends DatedAction>(actions: T[], dueDates: Record<string, DueDate>, todayIso: string): T[];
export declare function nextDated<T extends DatedAction>(actions: T[], dueDates: Record<string, DueDate>, todayIso: string): T | null;
export declare function icsText(value: unknown): string;
export declare function foldLine(line: string): string;
export declare function buildCalendarFeed(rows: CalendarFeedRow[] | null | undefined, options?: { now?: Date; origin?: string }): string;
export declare function subscribeLinks(feedUrl: string): { feed: string; webcal: string; google: string; outlook: string };
export declare function calendarClientFromUserAgent(userAgent: unknown): "apple" | "google" | "outlook" | "other" | null;
export declare function platformFromUserAgent(userAgent: unknown, maxTouchPoints?: number): "ios" | "android" | "mac" | "desktop";
