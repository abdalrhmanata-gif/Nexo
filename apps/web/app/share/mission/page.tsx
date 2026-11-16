import type { Metadata } from "next";
import Link from "next/link";
import { LocalizedFill, LocalizedText } from "../../../components/localized-text";
import { getTranslate } from "../../../lib/i18n-server";

export const metadata: Metadata = {
  title: "Shared Mission · Zavqera",
  description: "A public snapshot shared from Zavqera.",
};

type Snapshot = {
  name: string;
  intent: string;
  criteria: string[];
  completedSteps: string[];
  status: string;
  progress: number;
  outcome?: {
    status: "COMPLETED" | "FAILED";
    successScore: number;
    result: Record<string, string | number | boolean>;
  };
};

function isSafeResultKey(key: string) {
  if (key.length < 1 || key.length > 50) return false;
  const lower = key.toLowerCase();
  const forbidden = ["email", "token", "secret", "password", "credential", "owner", "workspace", "user", "phone", "address", "authorization", "session", "customerid"];
  if (forbidden.some((word) => lower.includes(word))) return false;
  return key.split("").every((char) => {
    const code = char.charCodeAt(0);
    return (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      char === " " || char === "_" || char === "-";
  });
}

function decodeSnapshot(value: string): Snapshot | null {
  if (!value || value.length > 9500) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;

    if (typeof raw.name !== "string" || typeof raw.intent !== "string") return null;

    const boundedStrings = (input: unknown, limit: number, maxLength: number) =>
      Array.isArray(input)
        ? input.filter((item): item is string => typeof item === "string")
            .slice(0, limit).map((item) => item.slice(0, maxLength))
        : [];

    const progress = typeof raw.progress === "number" && Number.isFinite(raw.progress)
      ? Math.max(0, Math.min(100, Math.round(raw.progress)))
      : 0;

    let outcome: Snapshot["outcome"];
    if (raw.outcome && typeof raw.outcome === "object") {
      const candidate = raw.outcome as Record<string, unknown>;
      if (
        (candidate.status === "COMPLETED" || candidate.status === "FAILED") &&
        typeof candidate.successScore === "number" &&
        Number.isFinite(candidate.successScore) &&
        candidate.result && typeof candidate.result === "object" &&
        !Array.isArray(candidate.result)
      ) {
        const result = Object.fromEntries(
          Object.entries(candidate.result as Record<string, unknown>)
            .filter(([key, item]) =>
              isSafeResultKey(key) &&
              ["string", "number", "boolean"].includes(typeof item),
            )
            .slice(0, 4)
            .map(([key, item]) => [key, typeof item === "string" ? item.slice(0, 240) : item]),
        ) as Record<string, string | number | boolean>;

        outcome = {
          status: candidate.status,
          successScore: Math.max(0, Math.min(1, candidate.successScore)),
          result,
        };
      }
    }

    return {
      name: raw.name.slice(0, 100),
      intent: raw.intent.slice(0, 700),
      criteria: boundedStrings(raw.criteria, 6, 180),
      completedSteps: boundedStrings(raw.completedSteps, 6, 140),
      status: typeof raw.status === "string" ? raw.status.slice(0, 30) : "DRAFT",
      progress,
      outcome,
    };
  } catch {
    return null;
  }
}

function displayResult(result: Record<string, string | number | boolean>) {
  return Object.entries(result).slice(0, 4);
}

export default async function SharedMissionPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const t = await getTranslate();
  const snapshot = decodeSnapshot((await searchParams).data ?? "");

  if (!snapshot) {
    return (
      <div className="container">
        <p className="eyebrow"><LocalizedText en="Mission unavailable" /></p>
        <h1 className="detail-title"><LocalizedText en="Mission unavailable" /></h1>
        <p className="detail-intent"><LocalizedText en="It may have been deleted, or it belongs to another workspace." /></p>
        <Link className="button" href="/templates"><LocalizedText en="Mission templates" /></Link>
      </div>
    );
  }

  const resultEntries = snapshot.outcome ? displayResult(snapshot.outcome.result) : [];
  const remix = new URLSearchParams({
    name: snapshot.name,
    intent: snapshot.intent,
    criteria: snapshot.criteria.join("\\n"),
    actions: snapshot.completedSteps.join("\\n"),
  }).toString();

  return (
    <div className="container">
      <p className="eyebrow"><LocalizedText en="Shared Mission" /></p>

      <section className="hero template-hero-panel">
        <div>
          <h1>{snapshot.name}</h1>
          <p>{snapshot.intent}</p>
        </div>
        <div className="landing-final-actions">
          <Link className="button" href={`/app/missions/new?${remix}`}>
            <LocalizedText en="Remix this Mission" /> <span aria-hidden="true">→</span>
          </Link>
          <Link className="button button-quiet" href="/templates"><LocalizedText en="Mission templates" /></Link>
        </div>
      </section>

      {snapshot.outcome && (
        <section className="card">
          <p className="eyebrow"><LocalizedText en="Outcome" /></p>
          <h2>{snapshot.outcome.status === "COMPLETED"
            ? <LocalizedText en="Completed" />
            : <LocalizedText en="Mission unavailable" />}</h2>
          <p className="detail-intent">
            <strong>{t("Success score:")}</strong> {Math.round(snapshot.outcome.successScore * 100)}%
          </p>
          {resultEntries.length > 0 && (
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

      <section className="grid" aria-label={t("Mission templates")}>
        <article className="card">
          <p className="eyebrow"><LocalizedText en="Success criteria" /></p>
          <h2><LocalizedText en="What good looks like" /></h2>
          {snapshot.criteria.length
            ? <ul className="list criteria-list">{snapshot.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
            : <p className="detail-intent"><LocalizedText en="No success criteria were recorded for this mission." /></p>}
        </article>

        <article className="card">
          <p className="eyebrow"><LocalizedText en="Mission plan" /></p>
          <h2>{snapshot.progress}%</h2>
          <p className="detail-intent"><LocalizedFill en="Completed actions: {count}" values={{ count: snapshot.completedSteps.length }} /></p>
        </article>

        <article className="card">
          <p className="eyebrow"><LocalizedText en="Actions" /></p>
          <h2><LocalizedText en="Actions" /></h2>
          {snapshot.completedSteps.length
            ? <ol className="list">{snapshot.completedSteps.map((step) => <li key={step}>{step}</li>)}</ol>
            : <p className="detail-intent"><LocalizedText en="No actions yet" /></p>}
        </article>
      </section>

      <section className="landing-final-cta">
        <div>
          <p className="eyebrow"><LocalizedText en="Start with one Mission" /></p>
          <h2><LocalizedText en="Give AI a Mission." /></h2>
          <p><LocalizedText en="Change the goal and steps to make this Mission your own." /></p>
        </div>
        <Link className="button" href={`/app/missions/new?${remix}`}>
          <LocalizedText en="Remix this Mission" /> <span aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  );
}
