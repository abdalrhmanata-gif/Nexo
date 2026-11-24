import Link from "next/link";
import { LocalizedText } from "./localized-text";
import { PendingSubmitButton } from "./pending-submit-button";
import { saveMissionAsTemplate } from "../app/app/templates/actions";
import { OWN_TEMPLATE_BOUNDS } from "../lib/own-templates.mjs";

const NOTICES: Record<string, string> = {
  plan: "Saving your own templates is part of Pro and Scale.",
  "no-steps": "Add at least one step to this Mission first; a template is its plan.",
  "too-many-steps": "A template can hold up to 50 steps. Cancel the steps you would not repeat, then save it.",
  "no-name": "Give the template a name.",
  limit: "You have reached 100 templates. Delete one you no longer use to save another.",
  missing: "That did not work just now. Please try again.",
  failed: "That did not work just now. Please try again.",
};

/**
 * "Save as my template" on a Mission page. On Pro and Scale it saves; on
 * Free and Plus it says what the feature does and where it is, so the
 * person sees it at the moment it would help.
 */
export function OwnTemplateBox({ missionId, missionName, active, notice }: { missionId: string; missionName: string; active: boolean; notice?: string }) {
  const message = notice ? NOTICES[notice] ?? NOTICES.failed : null;
  return <section id="own-template" className="own-template-box no-print" aria-labelledby="own-template-heading">
    <p className="eyebrow">{active ? <LocalizedText en="Reuse this plan" /> : <LocalizedText en="Pro and Scale" />}</p>
    <h2 id="own-template-heading"><LocalizedText en="Save as my template" /></h2>
    {message && <p className="field-error" role="alert"><LocalizedText en={message} /></p>}
    {active
      ? <form action={saveMissionAsTemplate} className="own-template-form">
        <p><LocalizedText en="Keep this Mission's intent, success criteria and steps, and start the next one from them in one press." /></p>
        <input type="hidden" name="missionId" value={missionId} />
        <label htmlFor="own-template-name"><LocalizedText en="Template name" /></label>
        <input id="own-template-name" name="name" defaultValue={missionName.slice(0, OWN_TEMPLATE_BOUNDS.name)} maxLength={OWN_TEMPLATE_BOUNDS.name} required />
        <PendingSubmitButton label="Save as my template" pendingLabel="Saving…" />
        <Link className="own-template-link" href="/app/templates"><LocalizedText en="Your templates" /></Link>
      </form>
      : <>
        <p><LocalizedText en="Turn this Mission into your own template and start the next one in one press, with every step already in place." /></p>
        <Link className="button" href="/pricing"><LocalizedText en="See Pro and Scale" /></Link>
      </>}
  </section>;
}
