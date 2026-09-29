import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { composeMissionObjective } from "../../../../lib/mission-content.mjs";

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
  return <button className="button" type="submit">Create mission</button>;
}

export default async function NewMissionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <div className="container"><div className="form">
    <p className="eyebrow"><Link href="/app">Workspace</Link> / New mission</p>
    <h1 className="detail-title">Shape the intent.</h1>
    <p className="detail-intent">Define what good looks like before anything is allowed to move.</p>
    <div className="form-note">Your mission is saved to your private workspace. Ownership comes from your authenticated session.</div>
    <form className="form-grid" action={createMission} noValidate>
      <div className="field"><label htmlFor="name">Mission name</label><input id="name" name="name" placeholder="e.g. Renew my passport" required /></div>
      <div className="field"><label htmlFor="intent">Intent</label><textarea id="intent" name="intent" placeholder="What should this mission help you accomplish?" required /><small>Use plain language. Keep the decision you want to make visible.</small></div>
      <div className="field"><label htmlFor="criteria">Success criteria</label><textarea id="criteria" name="criteria" placeholder="One criterion per line" required /><small>How you will know this mission succeeded. One per line.</small></div>
      <div className="field"><label htmlFor="actions">First steps <span className="field-optional">optional</span></label><textarea id="actions" name="actions" placeholder="One step per line" /><small>The work you already know about, in the order you would do it. You can add more at any time. Leave empty to start from your success criteria.</small></div>
      <SubmitButton />
      <Link className="button button-quiet" href="/app">Cancel</Link>
    </form>
    {(await searchParams).error === "validation" && <div className="field-error" role="alert">Add a name, an intent of at least 12 characters, and success criteria.</div>}
  </div></div>;
}
