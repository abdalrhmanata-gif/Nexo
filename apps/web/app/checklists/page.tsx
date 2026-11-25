import type { Metadata } from "next";
import { ChecklistsIndex, checklistsIndexMetadata } from "../../components/checklist-article";

export const metadata: Metadata = checklistsIndexMetadata();

export default function ChecklistsPage() {
  return <ChecklistsIndex />;
}
