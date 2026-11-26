import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TaskTrackerPage, taskTrackerMetadata } from "../../../components/task-tracker-page";
import { TASK_TRACKER_LANGUAGES } from "../../../lib/task-tracker.mjs";

// The landing page for people looking for an employee task tracker, in the
// languages it is written in (Arabic first). There is no English one: the
// home page is that page in English.
export const dynamicParams = false;

const LANGUAGES: readonly string[] = TASK_TRACKER_LANGUAGES;

export function generateStaticParams() {
  return LANGUAGES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return LANGUAGES.includes(lang) ? taskTrackerMetadata(lang) : {};
}

export default async function EmployeeTaskTrackerPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!LANGUAGES.includes(lang)) notFound();
  return <TaskTrackerPage lang={lang} />;
}
