import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { LocalizedText } from "../../../components/localized-text";
import { getLanguage, getTranslate } from "../../../lib/i18n-server";
import { fill } from "../../../lib/i18n";

type PageMetric = { path: string; views: number; days_seen: number; last_seen: string };
type SourceMetric = { source: string; views: number; percent: number };
type FunnelMetric = {
  day: string;
  landing: number;
  pricing: number;
  sign_up: number;
  landing_to_pricing_pct: number | null;
  pricing_to_signup_pct: number | null;
};
type SiteMetrics = {
  by_page: PageMetric[];
  sources: SourceMetric[];
  funnel: FunnelMetric[];
  page_sources: Array<{ path: string; source: string; views: number; last_seen: string }>;
};

// Latin digits in every language, as the rest of the app shows them.
function number(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

// Each column divides views of one page by views of another. Sign-up is also
// reached from the home page and links, so it can exceed pricing views: "800%"
// read as a conversion rate, which it is not.
function percent(value: number | null | undefined) {
  if (value == null) return "—";
  return value > 100 ? ">100%" : `${value.toFixed(1)}%`;
}

function date(value: string, language: string) {
  return new Intl.DateTimeFormat(`${language}-u-nu-latn`, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

// Arabic counts 3–10 with the plural noun ("10 أيام"), 11 and up with the
// singular ("14 يوماً"); the "|few" key carries the first form.
function daysSeenKey(days: number) {
  return days >= 3 && days <= 10 ? "{views} views · {days} days seen|few" : "{views} views · {days} days seen";
}

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  if (!isSupabaseConfigured()) redirect("/app");
  const t = await getTranslate();
  const language = await getLanguage();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=%2Fapp%2Fanalytics");

  const { data, error } = await supabase.rpc("get_site_metrics");
  if (error) {
    if (error.message.includes("ANALYTICS_ADMIN_REQUIRED")) redirect("/app");
    throw error;
  }

  const metrics = data as SiteMetrics;
  const totalViews = metrics.by_page.reduce((sum, item) => sum + item.views, 0);
  const pricingViews = metrics.by_page.find((item) => item.path === "/pricing")?.views ?? 0;
  const signupViews = metrics.by_page.find((item) => item.path === "/auth/sign-up")?.views ?? 0;
  const latestFunnel = metrics.funnel[0];

  return (
    <div className="container business-dashboard">
      <section className="section-heading business-hero">
        <div>
          <p className="eyebrow"><LocalizedText en="Website analytics" /></p>
          <h1><LocalizedText en="Understand what visitors do." /></h1>
          <p><LocalizedText en="Cookieless page-view analytics for the last 30 days. No third-party analytics script is required." /></p>
        </div>
      </section>

      <section className="business-metrics" aria-label={t("Website analytics metrics")}>
        <div className="business-metric business-metric-total">
          <span className="business-metric-copy"><strong>{number(totalViews)}</strong><span><LocalizedText en="Page views" /></span></span>
        </div>
        <div className="business-metric business-metric-active">
          <span className="business-metric-copy"><strong>{number(pricingViews)}</strong><span><LocalizedText en="Pricing views" /></span></span>
        </div>
        <div className="business-metric business-metric-waiting">
          <span className="business-metric-copy"><strong>{number(signupViews)}</strong><span><LocalizedText en="Sign-up views" /></span></span>
        </div>
        <div className="business-metric business-metric-completed">
          <span className="business-metric-copy"><strong>{percent(latestFunnel?.pricing_to_signup_pct)}</strong><span><LocalizedText en="Pricing → sign-up" /></span></span>
        </div>
      </section>

      <section className="business-focus business-focus-planning">
        <div className="business-focus-heading">
          <div>
            <p className="eyebrow"><LocalizedText en="Conversion funnel" /></p>
            <h2><LocalizedText en="Landing → pricing → sign-up" /></h2>
            <p><LocalizedText en="Daily page-view counts and conversion rates calculated from the existing internal counter." /></p>
          </div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead>
              <tr>
                {/* Each heading is written out so that it is a dictionary key the
                    translation guards can see; a list of bare strings is not. */}
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--border-color, #ddd)", fontSize: 13 }}><LocalizedText en="Day" /></th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--border-color, #ddd)", fontSize: 13 }}><LocalizedText en="Landing" /></th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--border-color, #ddd)", fontSize: 13 }}><LocalizedText en="Pricing" /></th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--border-color, #ddd)", fontSize: 13 }}><LocalizedText en="Sign-up" /></th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--border-color, #ddd)", fontSize: 13 }}><LocalizedText en="Landing → pricing" /></th>
                <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--border-color, #ddd)", fontSize: 13 }}><LocalizedText en="Pricing → sign-up" /></th>
              </tr>
            </thead>
            <tbody>
              {metrics.funnel.slice(0, 14).map((row) => (
                <tr key={row.day}>
                  <td style={{ padding: "10px 12px" }}>{date(row.day, language)}</td>
                  <td style={{ padding: "10px 12px" }}>{number(row.landing)}</td>
                  <td style={{ padding: "10px 12px" }}>{number(row.pricing)}</td>
                  <td style={{ padding: "10px 12px" }}>{number(row.sign_up)}</td>
                  <td style={{ padding: "10px 12px" }}>{percent(row.landing_to_pricing_pct)}</td>
                  <td style={{ padding: "10px 12px" }}>{percent(row.pricing_to_signup_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="business-shortcuts" aria-labelledby="analytics-pages-heading">
        <div className="business-section-heading">
          <div>
            <p className="eyebrow"><LocalizedText en="Top pages" /></p>
            <h2 id="analytics-pages-heading"><LocalizedText en="Where visitors spend time" /></h2>
          </div>
        </div>
        <div className="business-shortcut-grid">
          {metrics.by_page.slice(0, 8).map((item) => (
            <div className="business-shortcut" key={item.path}>
              <span className="business-shortcut-icon shortcut-navy" aria-hidden="true">↗</span>
              <span><strong>{item.path}</strong><small>{fill(t(daysSeenKey(item.days_seen)).split("|")[0], { views: number(item.views), days: item.days_seen })}</small></span>
              <span className="business-shortcut-arrow">{date(item.last_seen, language)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="business-recent" aria-labelledby="analytics-sources-heading">
        <div className="business-section-heading">
          <div>
            <p className="eyebrow"><LocalizedText en="Traffic sources" /></p>
            <h2 id="analytics-sources-heading"><LocalizedText en="Where visitors came from" /></h2>
          </div>
        </div>
        {metrics.sources.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {metrics.sources.slice(0, 10).map((item) => (
              <div key={item.source} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 14px", border: "1px solid var(--border-color, #ddd)", borderRadius: 12 }}>
                <strong>{item.source}</strong>
                <span>{number(item.views)} · {item.percent.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2><LocalizedText en="No external sources yet" /></h2>
            <p><LocalizedText en="Direct visits are recorded separately from referrer traffic." /></p>
          </div>
        )}
      </section>

      <p style={{ marginTop: 24, fontSize: 13, opacity: 0.72 }}>
        <LocalizedText en="Privacy note: this dashboard uses ZAVQERA's existing cookieless page counter. It does not expose raw page_metrics rows or grant customers direct access to analytics views." />
      </p>
    </div>
  );
}
