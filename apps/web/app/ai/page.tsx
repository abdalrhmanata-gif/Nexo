import Link from "next/link";
import type { Metadata } from "next";
import { LocalizedText } from "../../components/localized-text";
import { CopyLinkButton } from "../../components/copy-link-button";
import { getTranslate } from "../../lib/i18n-server";

// The public guide to using ZAVQERA from ChatGPT, Claude and Gemini: what it
// does, how to connect it, and what the assistant can and cannot see. It is
// also the documentation page the app directories ask for.

export const metadata: Metadata = {
  title: "ZAVQERA in ChatGPT, Claude and Gemini",
  description: "Connect ZAVQERA to your AI assistant. Plans you make in a conversation become Missions with steps, proof and dates, and the assistant can tell you what is next.",
  alternates: { canonical: "https://zavqera.com/ai" },
};

const SERVER_URL = "https://zavqera.com/mcp";
const SUPPORT_EMAIL = "hello@zavqera.com";

const EXAMPLES = [
  "“Save this plan as a ZAVQERA Mission with a target date of 1 March.”",
  "“What should I do next in ZAVQERA?”",
  "“Mark ‘Book an appointment’ as done. The reference is 48213.”",
  "“Start a ZAVQERA Mission from the event template for my sister's wedding.”",
  "“Share my launch Mission so I can send it to my partner.”",
];

const ABILITIES = [
  "Save a plan from the conversation as a Mission, with success criteria, steps and a target date.",
  "Start a Mission from one of ZAVQERA's templates.",
  "Show your Missions, a Mission's steps and proof, and what is late or due next.",
  "Add steps, mark a step done with its proof, or change a step's status.",
  "Set a target date and due dates for steps.",
  "Create a public link to a Mission's result when you ask.",
];

const ASSISTANTS = [
  { name: "ChatGPT", href: "https://help.openai.com/en/articles/12584461", how: "In ChatGPT on the web, add a custom MCP server from Plugins (or Apps) and paste the address." },
  { name: "Claude", href: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp", how: "In Claude, open Settings, then Connectors, add a custom connector and paste the address." },
  { name: "Gemini", href: "https://support.google.com/gemini/answer/13695044", how: "In Gemini, open Settings, then Connected Apps, add a custom app and paste the address." },
];

export default async function AiAssistantsPage() {
  const t = await getTranslate();
  return <div className="container ai-page">
    <p className="eyebrow"><LocalizedText en="ZAVQERA for AI assistants" /></p>
    <h1 className="detail-title"><LocalizedText en="Plan in your AI assistant. Keep it in ZAVQERA." /></h1>
    <p className="detail-intent"><LocalizedText en="Connect ZAVQERA to ChatGPT, Claude or Gemini. Plans you make in a conversation become Missions with steps, proof and dates, and the assistant can tell you what is next." /></p>

    <section className="card" aria-labelledby="ai-examples">
      <h2 id="ai-examples"><LocalizedText en="Ask things like" /></h2>
      <ul className="ai-examples">{EXAMPLES.map((example) => <li key={example}><LocalizedText en={example} /></li>)}</ul>
    </section>

    <section className="card" aria-labelledby="ai-connect">
      <h2 id="ai-connect"><LocalizedText en="Connect it in a minute" /></h2>
      <ol className="calendar-steps">
        <li><LocalizedText en="Copy this address." /></li>
        <li><LocalizedText en="In your assistant, add it as a custom connector or app." /></li>
        <li><LocalizedText en="Sign in to ZAVQERA when asked and press Allow." /></li>
        <li><LocalizedText en="Ask: “What should I do next in ZAVQERA?”" /></li>
      </ol>
      <CopyLinkButton value={SERVER_URL} label={t("Copy the address")} copiedLabel={t("Address copied")} />
      <ul className="ai-assistants">
        {ASSISTANTS.map((assistant) => <li key={assistant.name}>
          <strong>{assistant.name}</strong>: <LocalizedText en={assistant.how} />{" "}
          <a href={assistant.href} target="_blank" rel="noopener noreferrer"><LocalizedText en="Official help" /></a>
        </li>)}
      </ul>
      <p className="action-hint"><LocalizedText en="Adding a custom connector may need a paid plan of that assistant. Using ZAVQERA from an assistant is included in every ZAVQERA plan, including Free, and does not use your AI drafts." /></p>
    </section>

    <section className="card" aria-labelledby="ai-abilities">
      <h2 id="ai-abilities"><LocalizedText en="What the assistant can do" /></h2>
      <ul>{ABILITIES.map((ability) => <li key={ability}><LocalizedText en={ability} /></li>)}</ul>
      <p className="action-hint"><LocalizedText en="It cannot delete Missions, change your account or billing, or see anything outside your workspace." /></p>
    </section>

    <section className="card" id="privacy" aria-labelledby="ai-privacy">
      <h2 id="ai-privacy"><LocalizedText en="Your data and your control" /></h2>
      <ul>
        <li><LocalizedText en="You approve each assistant on zavqera.com. It receives access to your account only, never your password." /></li>
        <li><LocalizedText en="Everything it does runs with your permissions, exactly as on the website." /></li>
        <li><LocalizedText en="What it reads from ZAVQERA becomes part of your conversation with that assistant, under its provider's privacy policy." /></li>
        <li><LocalizedText en="You can remove an assistant at any time, and it stops at once." /> <Link href="/app/connections"><LocalizedText en="Connected AI apps" /></Link></li>
      </ul>
      <p className="action-hint"><Link href="/privacy"><LocalizedText en="Privacy" /></Link> · <Link href="/terms"><LocalizedText en="Terms" /></Link> · <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
    </section>
  </div>;
}
