import type { Metadata } from "next";
import Link from "next/link";
import { LocalizedText } from "../../../components/localized-text";

export const metadata: Metadata = {
  title: "Shared Mission · Zavqera",
  description: "See a public Zavqera Mission result.",
};

type Snapshot = {
  name: string;
  intent: string;
  criteria: string[];
  completedSteps: string[];
  status: string;
  progress: number;
  outcome?: {
    status: string;
    successScore: number;
    result: Record<string, unknown>;
  };
};

function decodeSnapshot(value: string): Snapshot | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(decoded) as Snapshot;
    if (!parsed || typeof parsed.name !== "string" || typeof parsed.intent !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function displayResult(result: Record<string, unknown>) {
  const entries = Object.entries(result).filter(([, value]) =>
    ["string", "number", "boolean"].includes(typeof value),
  );
  if (!entries.length) return null;
  return entries.slice(0, 8);
}

export default async function SharedMissionPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const snapshot = decodeSnapshot((await searchParams).data ?? "");

  if (!snapshot) {
    return (
      <div className="container">
        <p className="eyebrow"><LocalizedText en="Shared Mission" /></p>
        <h1 className="detail-title"><LocalizedText en="This Mission link is unavailable." /></h1>
        <p className="detail-intent"><LocalizedText en="The link may have expired, been truncated, or contain an invalid snapshot." /></p>
        <Link className="button" href="/templates"><LocalizedText en="Explore Missions" /></Link>
      </div>
    );
  }

  const resultEntries = snapshot.outcome ? displayResult(snapshot.outcome.result) : null;
  const remix = new URLSearchParams({
    name: snapshot.name,
    intent: snapshot.intent,
    criteria: snapshot.criteria.join("\n"),
    actions: snapshot.completedSteps.join("\n"),
  }).toString();

  return (
    <div className="container">
      <p className="eyebrow"><LocalizedText en="Shared Mission" /></p>

      <section className="hero template-hero-panel">
        <div>
          <p className="eyebrow"><LocalizedText en="A real Mission result" /></p>
          <h1>{snapshot.name}</h1>
          <p>{snapshot.intent}</p>
        </div>
        <div className="landing-final-actions">
          <Link className="button" href={`/app/missions/new?${remix}`}>
            <LocalizedText en="Remix this Mission" /> <span aria-hidden="true">→</span>
          </Link>
          <Link className="button button-quiet" href="/templates"><LocalizedText en="Explore Missions" /></Link>
        </div>
      </section>

      {snapshot.outcome && (
        <section className="card">
          <p className="eyebrow"><LocalizedText en="Result" /></p>
          <h2>{snapshot.outcome.status === "COMPLETED" ? "Mission completed" : "Mission result"}</h2>
          <p className="detail-intent">
            Success score: {Math.round(snapshot.outcome.successScore * 100)}%
          </p>
          {resultEntries && (
            <div className="grid">
              {resultEntries.map(([key, value]) => (
                <article className="card" key={key}>
                  <p className="eyebrow">{key.replace(/[_-]/g, " ")}</p>
                  <p>{String(value)}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="grid" aria-label="Mission snapshot">
        <article className="card">
          <p className="eyebrow"><LocalizedText en="Success criteria" /></p>
          <h2><LocalizedText en="What good looked like" /></h2>
          <ul className="list criteria-list">{snapshot.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
        </article>

        <article className="card">
          <p className="eyebrow"><LocalizedText en="Progress" /></p>
          <h2>{snapshot.progress}%</h2>
          <p className="detail-intent">{snapshot.completedSteps.length} completed step{snapshot.completedSteps.length === 1 ? "" : "s"}.</p>
        </article>

        <article className="card">
          <p className="eyebrow"><LocalizedText en="The work" /></p>
          <h2><LocalizedText en="What the Mission did" /></h2>
          {snapshot.completedSteps.length
            ? <ol className="list">{snapshot.completedSteps.map((step) => <li key={step}>{step}</li>)}</ol>
            : <p className="detail-intent"><LocalizedText en="No completed steps were shared in this snapshot." /></p>}
        </article>
      </section>

      <section className="landing-final-cta">
        <div>
          <p className="eyebrow"><LocalizedText en="Try the idea yourself" /></p>
          <h2><LocalizedText en="Don’t just read the result. Give AI a Mission." /></h2>
          <p><LocalizedText en="Remix the Mission, change the goal and limits, and run your own version in Zavqera." /></p>
        </div>
        <Link className="button" href={`/app/missions/new?${remix}`}>
          <LocalizedText en="Remix this Mission" /> <span aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  );
}
