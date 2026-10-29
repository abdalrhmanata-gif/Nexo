import Link from "next/link";

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
        <p className="eyebrow"><span className="landing-live-dot" aria-hidden="true" /> Mission control for AI-assisted work</p>
        <h1>From intent to action. <span>With control at every step.</span></h1>
        <p className="landing-lede">Turn goals into structured Missions, keep every next step visible, and make decisions with the evidence you actually have.</p>
        <div className="landing-hero-actions">
          <Link className="button" href="/app">Open workspace <span aria-hidden="true">→</span></Link>
          <Link className="button button-quiet" href="/app/opportunities">Explore Opportunity Intelligence</Link>
        </div>
        <div className="landing-trust-line"><span aria-hidden="true">✓</span> Review before action. Clear boundaries. No false certainty.</div>
        <Link className="landing-template-link" href="/templates">Browse mission templates <span aria-hidden="true">→</span></Link>
      </div>
      <div className="landing-visual" aria-label="Illustrative view of a governed Mission">
        <div className="landing-visual-top"><span className="landing-window-dots"><i/><i/><i/></span><span>MISSION CONTROL</span><span className="landing-preview-tag">Illustrative view</span></div>
        <div className="landing-visual-heading"><span className="landing-mission-symbol" aria-hidden="true">◎</span><div><p>ACTIVE MISSION</p><strong>Validate a new opportunity</strong></div><span className="status status-active">Active</span></div>
        <p className="landing-visual-intent">Outcome: decide whether this idea is worth pursuing, using evidence and a small test.</p>
        <div className="landing-visual-section"><span>Next steps</span><span>2 of 3 ready</span></div>
        <div className="landing-mini-step"><span className="landing-step-check">✓</span><div><strong>Define the success criteria</strong><small>Completed · Clear outcome recorded</small></div></div>
        <div className="landing-mini-step"><span className="landing-step-check">✓</span><div><strong>Gather initial evidence</strong><small>Completed · Notes captured</small></div></div>
        <div className="landing-mini-step landing-mini-step-current"><span className="landing-step-number">3</span><div><strong>Review the weakest assumption</strong><small>Next action · Human decision required</small></div></div>
        <div className="landing-visual-footer"><span><i className="landing-indicator" /> Authority bounded</span><span>Progress is reviewable</span></div>
      </div>
    </section>

    <section className="landing-proof-strip" aria-label="Product principles">
      <div><span className="landing-proof-icon">01</span><span><strong>Explicit goals</strong><small>Know what success means</small></span></div>
      <div><span className="landing-proof-icon">02</span><span><strong>Visible work</strong><small>See actions and blockers</small></span></div>
      <div><span className="landing-proof-icon">03</span><span><strong>Human oversight</strong><small>Keep decisions in your hands</small></span></div>
    </section>

    <section className="landing-capabilities">
      <div className="landing-section-heading"><div><p className="eyebrow">A system for making progress</p><h2>Less uncertainty. Better next steps.</h2></div><p>Zavqera brings planning, execution tracking, and decision support into one calm workspace.</p></div>
      <div className="landing-capability-grid">{capabilities.map((item) => <article className="landing-capability-card" key={item.number}>
        <div className={`landing-capability-icon landing-capability-${item.tone}`}><CapabilityIcon kind={item.icon}/></div>
        <span className="landing-capability-number">{item.number}</span>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </article>)}</div>
    </section>

    <section className="landing-how">
      <div><p className="eyebrow">How it works</p><h2>Progress you can explain.</h2><p>Every Mission starts with an intended outcome and remains reviewable as the work changes.</p></div>
      <div className="landing-how-steps">
        <div><span>1</span><strong>Define</strong><p>State the goal and what good looks like.</p></div>
        <div><span>2</span><strong>Work</strong><p>Track steps, status, and decisions that need you.</p></div>
        <div><span>3</span><strong>Review</strong><p>Check evidence before you accept an outcome.</p></div>
      </div>
    </section>

    <section className="landing-final-cta"><div><p className="eyebrow">Start with one Mission</p><h2>Make the next step clearer.</h2><p>Begin with the workflow you have today. Keep control of what happens next.</p></div><div className="landing-final-actions"><Link className="button" href="/app">Open workspace <span aria-hidden="true">→</span></Link><Link className="landing-pricing-link" href="/pricing">View proposed plans</Link></div></section>
  </div>;
}
