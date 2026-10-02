import Link from "next/link";
import { LocalizedText } from "../components/localized-text";

export default function HomePage() {
  return <div className="container"><section className="hero">
    <p className="eyebrow"><LocalizedText en="Mission control for autonomous AI" /></p>
    <h1><LocalizedText en="Keep intent clear. Keep authority bounded." /></h1>
    <p><LocalizedText en="ZAVQERA gives teams a quiet, legible place to shape long-running AI work and see what is happening before it becomes action." /></p>
    <p><Link className="button" href="/app"><LocalizedText en="Open workspace" /></Link></p>
  </section></div>;
}
