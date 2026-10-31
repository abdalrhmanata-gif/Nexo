import Link from "next/link";
import { LocalizedText } from "../components/localized-text";

const capabilities = [
  {
    number: "01",
    title: "Make intent explicit",
    description: "Define the outcome, success criteria, and boundaries before work begins.",
    icon: "target",
    tone: "teal",
  },
  {
    number: "02",
    title: "Know what happens next",
    description: "Track each Mission, its actions, blockers, and progress in one place.",
    icon: "steps",
    tone: "blue",
  },
  {
    number: "03",
    title: "Decide with evidence",
    description: "Compare opportunities, record what you know, and expose what is still uncertain.",
    icon: "evidence",
    tone: "amber",
  },
];

function CapabilityIcon({ kind }: { kind: string }) {
  if (kind === "target") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/></svg>;
  if (kind === "steps") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h11M4 19h7"/><circle cx="19" cy="12" r="2"/><circle cx="15" cy="19" r="2"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.5 5.2 5.8.9-4.2 4.1 1 5.8-5.1-2.7-5.1 2.7 1-5.8-4.2-4.1 5.8-.9L12 3Z"/></svg>;
}

export default function HomePage() {
  return <div className="landing-page">
    <section className="landing-hero">
      <div className="landing-hero-copy">
        <p className="eyebrow"><span className="landing-live-dot" aria-hidden="true" /> <LocalizedText en="Mission control for AI-assisted work" /></p>
        <h1><LocalizedText en="From intent to action." /> <span><LocalizedText en="With control at every step." /></span></h1>
        <p className="landing-lede"><LocalizedText en="Turn goals into structured Missions, keep every next step visible, and make decisions with the evidence you actually have." /></p>
        <div className="landing-hero-actions">
          <Link className="button" href="/app"><LocalizedText en="Open workspace" /> <span aria-hidden="true">→</span></Link>
          <Link className="button button-quiet" href="/app/opportunities"><LocalizedText en="Explore Opportunity Intelligence" /></Link>
        </div>
        <div className="landing-trust-line"><span aria-hidden="true">✓</span> <LocalizedText en="Review before action. Clear boundaries. No false certainty." /></div>
        <Link className="landing-template-link" href="/templates"><LocalizedText en="Browse mission templates" /> <span aria-hidden="true">→</span></Link>
      </div>
      <div className="landing-visual" role="group" aria-labelledby="landing-visual-label"><span id="landing-visual-label" className="visually-hidden"><LocalizedText en="Illustrative view of a governed Mission" /></span>
        <div className="landing-visual-top"><span className="landing-window-dots"><i/><i/><i/></span><span>MISSION CONTROL</span><span className="landing-preview-tag"><LocalizedText en="Illustrative view" /></span></div>
        <div className="landing-visual-heading"><span className="landing-mission-symbol" aria-hidden="true">◎</span><div><p><LocalizedText en="ACTIVE MISSION" /></p><strong><LocalizedText en="Validate a new opportunity" /></strong></div><span className="status status-active">Active</span></div>
        <p className="landing-visual-intent"><LocalizedText en="Outcome: decide whether this idea is worth pursuing, using evidence and a small test." /></p>
        <div className="landing-visual-section"><span><LocalizedText en="Next steps" /></span><span><LocalizedText en="2 of 3 ready" /></span></div>
        <div className="landing-mini-step"><span className="landing-step-check">✓</span><div><strong><LocalizedText en="Define the success criteria" /></strong><small><LocalizedText en="Completed · Clear outcome recorded" /></small></div></div>
        <div className="landing-mini-step"><span className="landing-step-check">✓</span><div><strong><LocalizedText en="Gather initial evidence" /></strong><small><LocalizedText en="Completed · Notes captured" /></small></div></div>
        <div className="landing-mini-step landing-mini-step-current"><span className="landing-step-number">3</span><div><strong><LocalizedText en="Review the weakest assumption" /></strong><small><LocalizedText en="Next action · Human decision required" /></small></div></div>
        <div className="landing-visual-footer"><span><i className="landing-indicator" /> <LocalizedText en="Authority bounded" /></span><span><LocalizedText en="Progress is reviewable" /></span></div>
      </div>
    </section>

    <section className="landing-proof-strip" aria-labelledby="landing-proof-label"><span id="landing-proof-label" className="visually-hidden"><LocalizedText en="Product principles" /></span>
      <div><span className="landing-proof-icon">01</span><span><strong><LocalizedText en="Explicit goals" /></strong><small><LocalizedText en="Know what success means" /></small></span></div>
      <div><span className="landing-proof-icon">02</span><span><strong><LocalizedText en="Visible work" /></strong><small><LocalizedText en="See actions and blockers" /></small></span></div>
      <div><span className="landing-proof-icon">03</span><span><strong><LocalizedText en="Human oversight" /></strong><small><LocalizedText en="Keep decisions in your hands" /></small></span></div>
    </section>

    <section className="landing-capabilities">
      <div className="landing-section-heading"><div><p className="eyebrow"><LocalizedText en="A system for making progress" /></p><h2><LocalizedText en="Less uncertainty. Better next steps." /></h2></div><p><LocalizedText en="Zavqera brings planning, execution tracking, and decision support into one calm workspace." /></p></div>
      <div className="landing-capability-grid">{capabilities.map((item) => <article className="landing-capability-card" key={item.number}>
        <div className={`landing-capability-icon landing-capability-${item.tone}`}><CapabilityIcon kind={item.icon}/></div>
        <span className="landing-capability-number">{item.number}</span>
        <h3><LocalizedText en={item.title} /></h3>
        <p><LocalizedText en={item.description} /></p>
      </article>)}</div>
    </section>

    <section className="landing-how">
      <div><p className="eyebrow"><LocalizedText en="How it works" /></p><h2><LocalizedText en="Progress you can explain." /></h2><p><LocalizedText en="Every Mission starts with an intended outcome and remains reviewable as the work changes." /></p></div>
      <div className="landing-how-steps">
        <div><span>1</span><strong><LocalizedText en="Define" /></strong><p><LocalizedText en="State the goal and what good looks like." /></p></div>
        <div><span>2</span><strong><LocalizedText en="Work" /></strong><p><LocalizedText en="Track steps, status, and decisions that need you." /></p></div>
        <div><span>3</span><strong><LocalizedText en="Review" /></strong><p><LocalizedText en="Check evidence before you accept an outcome." /></p></div>
      </div>
    </section>

    <section className="landing-final-cta"><div><p className="eyebrow"><LocalizedText en="Start with one Mission" /></p><h2><LocalizedText en="Make the next step clearer." /></h2><p><LocalizedText en="Begin with the workflow you have today. Keep control of what happens next." /></p></div><div className="landing-final-actions"><Link className="button" href="/app"><LocalizedText en="Open workspace" /> <span aria-hidden="true">→</span></Link><Link className="landing-pricing-link" href="/pricing"><LocalizedText en="View proposed plans" /></Link></div></section>
  </div>;
}
