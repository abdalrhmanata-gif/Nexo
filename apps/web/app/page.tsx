import Link from "next/link";
import { LocalizedText } from "../components/localized-text";

export default function HomePage() {
  return <div className="container">
    <section className="hero">
      <p className="eyebrow"><LocalizedText en="Mission control for autonomous AI" /></p>
      <h1><LocalizedText en="Clear goals. Practical plans. You’re in control." /></h1>
      <p><LocalizedText en="ZAVQERA gives teams a quiet, legible place to shape long-running AI work and see what is happening before it becomes action." /></p>
      <div className="hero-actions">
        <Link className="button" href="/auth/sign-up"><LocalizedText en="Try ZAVQERA free" /></Link>
        <Link className="button button-quiet" href="/pricing"><LocalizedText en="View pricing" /></Link>
      </div>
      <p className="hero-free"><strong><LocalizedText en="Free to start." /></strong> <LocalizedText en="5 AI generations each month. No payment required." /></p>
    </section>

    <section className="value-grid" aria-label="Product principles">
      <article className="card value-card">
        <p className="eyebrow"><LocalizedText en="01 · Intent" /></p>
        <h2><LocalizedText en="Start with the outcome." /></h2>
        <p><LocalizedText en="Turn a goal into a clear mission before work begins." /></p>
      </article>
      <article className="card value-card">
        <p className="eyebrow"><LocalizedText en="02 · Control" /></p>
        <h2><LocalizedText en="Review before action." /></h2>
        <p><LocalizedText en="AI can draft. You decide what gets created and what moves." /></p>
      </article>
      <article className="card value-card">
        <p className="eyebrow"><LocalizedText en="03 · Clarity" /></p>
        <h2><LocalizedText en="See what needs attention." /></h2>
        <p><LocalizedText en="Keep long-running work understandable instead of turning it into a black box." /></p>
      </article>
    </section>
  </div>;
}
