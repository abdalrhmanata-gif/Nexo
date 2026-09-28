import Link from "next/link";

export default function HomePage() {
  return <div className="container"><section className="hero">
    <p className="eyebrow">Mission control for autonomous AI</p>
    <h1>Keep intent clear. Keep authority bounded.</h1>
    <p>ZAVQERA gives teams a quiet, legible place to shape long-running AI work and see what is happening before it becomes action.</p>
    <p><Link className="button" href="/app">Open workspace</Link></p>
  </section></div>;
}
