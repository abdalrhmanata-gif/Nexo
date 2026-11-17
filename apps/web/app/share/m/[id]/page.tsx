import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { cache } from "react";
import { LocalizedFill, LocalizedText } from "../../../../components/localized-text";
import { resolveRequestOrigin } from "../../../../lib/auth/redirect.mjs";
import { getTranslate } from "../../../../lib/i18n-server";
import { shareIdOrNull, type MissionShareSnapshot } from "../../../../lib/mission-share.mjs";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

// A shared mission result. Everything shown here comes from the copy stored
// when the owner pressed "Share result"; nothing is read from the link except
// the id, and nothing from the mission, its workspace or its owner.

const readShare = cache(async (id: string): Promise<MissionShareSnapshot | null> => {
  const shareId = shareIdOrNull(id);
  if (!shareId || !isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const found = await supabase.rpc("get_mission_share", { p_id: shareId });
  return found.error ? null : found.data as MissionShareSnapshot | null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const snapshot = await readShare((await params).id);
  if (!snapshot) return { title: "Zavqera", robots: { index: false, follow: false } };
  const title = `${snapshot.name} · Zavqera`;
  const description = snapshot.intent.slice(0, 180);
  // The preview picture needs a full address: the one this link was opened on.
  const origin = resolveRequestOrigin(await headers(), "https://zavqera.com");
  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: false, follow: false },
  };
}

export default async function SharedMissionPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslate();
  const { id } = await params;
  const snapshot = await readShare(id);

  if (!snapshot) {
    return (
      <div className="container">
        <p className="eyebrow"><LocalizedText en="Shared Mission" /></p>
        <h1 className="detail-title"><LocalizedText en="This shared Mission is not available." /></h1>
        <p className="detail-intent"><LocalizedText en="The link may be wrong, or the person who shared it has stopped sharing." /></p>
        <Link className="button" href="/templates"><LocalizedText en="Mission templates" /></Link>
      </div>
    );
  }

  const shareId = shareIdOrNull(id) as string;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("record_mission_share_event", { p_id: shareId, p_kind: "view" });

  const planned = snapshot.plannedSteps ?? [];
  const resultEntries = snapshot.outcome ? Object.entries(snapshot.outcome.result) : [];
  // A plain link, not prefetched: opening it is what counts as a remix.
  const remixHref = `/share/m/${shareId}/remix`;

  return (
    <div className="container">
      <p className="eyebrow"><LocalizedText en="Shared Mission" /></p>

      <section className="hero template-hero-panel">
        <div>
          <h1>{snapshot.name}</h1>
          <p>{snapshot.intent}</p>
        </div>
        <div className="landing-final-actions">
          <a className="button" href={remixHref} rel="nofollow">
            <LocalizedText en="Remix this Mission" /> <span aria-hidden="true">→</span>
          </a>
          <Link className="button button-quiet" href="/templates"><LocalizedText en="Mission templates" /></Link>
        </div>
      </section>

      {snapshot.outcome && (
        <section className="card">
          <p className="eyebrow"><LocalizedText en="Outcome" /></p>
          <h2>{snapshot.outcome.status === "COMPLETED"
            ? <LocalizedText en="Completed" />
            : <LocalizedText en="Not achieved" />}</h2>
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
          {snapshot.completedSteps.length + planned.length
            ? <ol className="list">
                {snapshot.completedSteps.map((step) => <li key={`done-${step}`}><span aria-hidden="true">✓ </span>{step}</li>)}
                {planned.map((step) => <li key={`todo-${step}`}>{step}</li>)}
              </ol>
            : <p className="detail-intent"><LocalizedText en="No actions yet" /></p>}
        </article>
      </section>

      <section className="landing-final-cta">
        <div>
          <p className="eyebrow"><LocalizedText en="Start with one Mission" /></p>
          <h2><LocalizedText en="Give AI a Mission." /></h2>
          <p><LocalizedText en="Change the goal and steps to make this Mission your own." /></p>
        </div>
        <a className="button" href={remixHref} rel="nofollow">
          <LocalizedText en="Remix this Mission" /> <span aria-hidden="true">→</span>
        </a>
      </section>
    </div>
  );
}
