import { redirect } from "next/navigation";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";

async function createMission(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim();
  const criteria = String(formData.get("criteria") ?? "").trim();
  if (!name || intent.length < 12 || !criteria) {
    redirect("/app/missions/new?error=validation");
  }
  const repository = await createSupabaseMissionRepository();
  const actions = criteria.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const mission = await repository.createMission!({ objective: `${name}\n\n${intent}\n\nSuccess criteria:\n${criteria}`, actions });
  redirect(`/app/missions/${mission.id}`);
}

function SubmitButton() {
  return <button className="button" type="submit">Create mission</button>;
}

export default async function NewMissionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <div className="container"><div className="form">
    <p className="eyebrow">Mission setup</p><h1 className="detail-title">Shape the intent.</h1>
    <p className="detail-intent">Define what good looks like before anything is allowed to move.</p>
    <div className="form-note">Your mission is saved to your private workspace. Ownership comes from your authenticated session.</div>
    <form className="form-grid" action={createMission} noValidate>
      <div className="field"><label htmlFor="name">Mission name</label><input id="name" name="name" placeholder="e.g. Launch brief synthesis" required /></div>
      <div className="field"><label htmlFor="intent">Intent</label><textarea id="intent" name="intent" placeholder="What should this mission help you accomplish?" required /><small>Use plain language. Keep the decision you want to make visible.</small></div>
      <div className="field"><label htmlFor="criteria">Success criteria</label><textarea id="criteria" name="criteria" placeholder="One criterion per line" required /></div>
      <input type="hidden" name="review" value="bounded" />
      <SubmitButton />
    </form>
    {(await searchParams).error === "validation" && <div className="field-error" role="alert">Add a name, an intent of at least 12 characters, and success criteria.</div>}
  </div></div>;
}
