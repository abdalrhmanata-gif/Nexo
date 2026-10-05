import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { composeMissionObjective } from "../../../../lib/mission-content.mjs";
import { LocalizedText } from "../../../../components/localized-text";
import { MissionCreateForm } from "../../../../components/mission-create-form";

async function createMission(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim();
  const criteria = String(formData.get("criteria") ?? "").trim();
  const steps = String(formData.get("actions") ?? "").trim();
  if (!name || intent.length < 12 || !criteria) {
    redirect("/app/missions/new?error=validation");
  }
  const repository = await createSupabaseMissionRepository();
  const toLines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  // Success criteria describe what good looks like; actions are the work. When
  // no separate first steps are given the criteria seed the plan, which keeps
  // every mission created before these were separated behaving as it did.
  const actions = steps ? toLines(steps) : toLines(criteria);
  const mission = await repository.createMission!({ objective: composeMissionObjective({ name, intent, criteria }), actions });
  redirect(`/app/missions/${mission.id}`);
}

function SubmitButton() {
  return <button className="button" type="submit"><LocalizedText en="Create mission" /></button>;
}

export default async function NewMissionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <div className="container"><div className="form">
    <p className="eyebrow"><Link href="/app"><LocalizedText en="Workspace" /></Link> / <LocalizedText en="New mission" /></p>
    <h1 className="detail-title"><LocalizedText en="Shape the intent." /></h1>
    <p className="detail-intent"><LocalizedText en="Define what good looks like before anything is allowed to move." /></p>
    <div className="form-note"><LocalizedText en="When you create it, your mission is saved to your private workspace. Ownership comes from your authenticated session." /></div>
    <MissionCreateForm action={createMission} />
    {(await searchParams).error === "validation" && <div className="field-error" role="alert"><LocalizedText en="Add a name, an intent of at least 12 characters, and success criteria." /></div>}
  </div></div>;
}
