import Link from "next/link";
import { LocalizedText } from "../components/localized-text";
import { getLanguage, getTranslate } from "../lib/i18n-server";
import { guidePath } from "../lib/guides";
import { readSignedIn } from "../components/shell";
import { GoalStarter } from "../components/goal-starter";
import { homeStructuredData, jsonLdScript } from "../lib/site-schema.mjs";

// The home page says what ZAVQERA is for in one look: checklists for a small
// team, where every step has an owner, a due date and proof. The same promise
// as the search description (lib/site-schema.mjs) and the Peerlist page, so a
// visitor who arrives from either finds what they were told.
const capabilities = [
  {
    number: "01",
    title: "Start from a ready-made checklist",
    description: "Employee onboarding, month-end close, client handoffs and more, each step saying what proof to keep.",
    icon: "steps",
    tone: "teal",
  },
  {
    number: "02",
    title: "Give every step an owner",
    description: "Assign steps to people on your team with a due date. Each person sees what is theirs and what is late.",
    icon: "target",
    tone: "blue",
  },
  {
    number: "03",
    title: "Keep the proof",
    description: "When a step is done, save a note and a link, so anyone can check the work later.",
    icon: "evidence",
    tone: "amber",
  },
];

function CapabilityIcon({ kind }: { kind: string }) {
  if (kind === "target") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>;
  if (kind === "steps") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h11M4 19h7"/><circle cx="19" cy="12" r="2"/><circle cx="15" cy="19" r="2"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.5 5.2 5.8.9-4.2 4.1 1 5.8-5.1-2.7-5.1 2.7 1-5.8-4.2-4.1 5.8-.9L12 3Z"/></svg>;
}

export default async function HomePage() {
  const t = await getTranslate();
  const signedIn = await readSignedIn();
  const language = await getLanguage();
  return <div className="landing-page">
    {/* What ZAVQERA is, for search engines and AI assistants: the company,
        the site and the product with its real prices. */}
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(homeStructuredData()) }} />
    <section className="landing-hero">
      <div className="landing-hero-copy">
        <p className="eyebrow"><span className="landing-live-dot" aria-hidden="true" /> <LocalizedText en="Checklists for small teams" /></p>
        <h1><LocalizedText en="Every step has an owner." /> <span><LocalizedText en="And proof when it is done." /></span></h1>
        <p className="landing-lede"><LocalizedText en="Start from a ready-made checklist or describe your goal. Give each step to someone on your team with a due date, see what is late, and keep a note and a link that show the work was done." /></p>
        {/* The first thing a visitor can do is see a plan for their own goal,
            before any account. Sign-up used to be the only way in, and of
            the visitors who reached it almost none came out with a mission. */}
        <GoalStarter mode="preview" />
        <div className="landing-hero-actions">
          {signedIn
            ? <Link className="button button-quiet" href="/app"><LocalizedText en="Open workspace" /> <span aria-hidden="true">→</span></Link>
            : <Link className="button button-quiet" href="/auth/sign-up"><LocalizedText en="Start free" /> <span aria-hidden="true">→</span></Link>}
          <Link className="button button-quiet" href="/checklists"><LocalizedText en="Browse the checklists" /></Link>
        </div>
        <div className="landing-trust-line"><span aria-hidden="true">✓</span> <LocalizedText en="Free plan, no card. Your team joins free." /></div>
        <p className="landing-honesty"><LocalizedText en="AI drafts only when you ask, and never acts for you. You review every step before it counts." /></p>
        <Link className="landing-template-link" href="/compare"><LocalizedText en="Compare with Process Street, Trello and Manifestly" /> <span aria-hidden="true">→</span></Link>
        <Link className="landing-template-link" href="/compare/zavqera-vs-chatgpt-claude-gemini"><LocalizedText en="Compare with ChatGPT, Claude and Gemini" /> <span aria-hidden="true">→</span></Link>
        <Link className="landing-template-link" href={guidePath(language)}><LocalizedText en="Read the step-by-step guides, with official sources" /> <span aria-hidden="true">→</span></Link>
        <Link className="landing-template-link" href="/templates"><LocalizedText en="Plans for other goals" /> <span aria-hidden="true">→</span></Link>
      </div>
      <div className="landing-visual" role="group" aria-label={t("Illustrative view of a team checklist")}>
        <div className="landing-visual-top"><span className="landing-window-dots"><i/><i/><i/></span><span><LocalizedText en="TEAM CHECKLIST" /></span><span className="landing-preview-tag"><LocalizedText en="Illustrative view" /></span></div>
        <div className="landing-visual-heading"><span className="landing-mission-symbol" aria-hidden="true">◎</span><div><p><LocalizedText en="CHECKLIST" /></p><strong><LocalizedText en="Client onboarding" /></strong></div><span className="status status-active"><LocalizedText en="Active" /></span></div>
        <p className="landing-visual-intent"><LocalizedText en="Each step has an owner, a due date and proof." /></p>
        <div className="landing-visual-section"><span><LocalizedText en="Steps" /></span><span><LocalizedText en="2 of 9 done" /></span></div>
        <div className="landing-mini-step"><span className="landing-step-check">✓</span><div><strong><LocalizedText en="Get the contract signed" /></strong><small><LocalizedText en="Done by Sara · Proof: signed contract" /></small></div></div>
        <div className="landing-mini-step"><span className="landing-step-check">✓</span><div><strong><LocalizedText en="Send the deposit request" /></strong><small><LocalizedText en="Done by Omar · Proof: invoice paid" /></small></div></div>
        <div className="landing-mini-step landing-mini-step-current"><span className="landing-step-number">3</span><div><strong><LocalizedText en="Get access to the accounts" /></strong><small><LocalizedText en="Lina · 2 days late" /></small></div></div>
        <div className="landing-visual-footer"><span><i className="landing-indicator" /> <LocalizedText en="Owner on every step" /></span><span><LocalizedText en="Proof you can check" /></span></div>
      </div>
    </section>

    <section className="landing-proof-strip" aria-label={t("Product principles")}>
      <div><span className="landing-proof-icon">01</span><span><strong><LocalizedText en="An owner on every step" /></strong><small><LocalizedText en="Everyone sees what is theirs" /></small></span></div>
      <div><span className="landing-proof-icon">02</span><span><strong><LocalizedText en="A due date on every step" /></strong><small><LocalizedText en="Late steps stand out" /></small></span></div>
      <div><span className="landing-proof-icon">03</span><span><strong><LocalizedText en="Proof when it is done" /></strong><small><LocalizedText en="A note and a link anyone can check" /></small></span></div>
    </section>

    <section className="landing-capabilities">
      <div className="landing-section-heading"><div><p className="eyebrow"><LocalizedText en="Built for the work you repeat" /></p><h2><LocalizedText en="Onboarding, month-end, handoffs. Done the same way every time." /></h2></div><p><LocalizedText en="ZAVQERA turns the processes a small team repeats into checklists everyone can follow, with the proof kept in one place." /></p></div>
      <div className="landing-capability-grid">{capabilities.map((item) => <article className="landing-capability-card" key={item.number}>
        <div className={`landing-capability-icon landing-capability-${item.tone}`}><CapabilityIcon kind={item.icon}/></div>
        <span className="landing-capability-number">{item.number}</span>
        <h3>{t(item.title)}</h3>
        <p>{t(item.description)}</p>
      </article>)}</div>
    </section>

    <section className="landing-how">
      <div><p className="eyebrow"><LocalizedText en="How it works" /></p><h2><LocalizedText en="Three steps, then repeat." /></h2><p><LocalizedText en="Pick a checklist or describe your goal, share the work, and keep the record." /></p></div>
      <div className="landing-how-steps">
        <div><span>1</span><strong><LocalizedText en="Pick" /></strong><p><LocalizedText en="Start from a ready-made checklist, or let AI draft the steps from your goal." /></p></div>
        <div><span>2</span><strong><LocalizedText en="Assign" /></strong><p><LocalizedText en="Give each step an owner and a due date. Invite your team for free." /></p></div>
        <div><span>3</span><strong><LocalizedText en="Prove" /></strong><p><LocalizedText en="Mark steps done with a note and a link. Late steps stand out." /></p></div>
      </div>
    </section>

    <section className="landing-final-cta"><div><p className="eyebrow"><LocalizedText en="Start with one checklist" /></p><h2><LocalizedText en="Run your next process with an owner on every step." /></h2><p><LocalizedText en="Pick a checklist, invite your team and see who does what, by when." /></p></div><div className="landing-final-actions">{signedIn ? <Link className="button" href="/app"><LocalizedText en="Open workspace" /> <span aria-hidden="true">→</span></Link> : <Link className="button" href="/try"><LocalizedText en="Get a plan for your goal" /> <span aria-hidden="true">→</span></Link>}<Link className="landing-pricing-link" href="/pricing"><LocalizedText en="Pricing" /></Link></div></section>
  </div>;
}
