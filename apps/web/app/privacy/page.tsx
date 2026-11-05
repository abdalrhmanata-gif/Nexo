import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";

// Deliberately in English only, and the page says so. A liability or data
// clause that is mistranslated is worse than one the reader has to read in a
// second language, and this text is the one place in the product where being
// approximately right is not good enough. Everything here is drawn from what
// the code actually does — the cookie names, the storage key, the region, the
// fact that no analytics exist — so it can be checked against the repository
// rather than believed.

export const metadata = {
  title: "Privacy — ZAVQERA",
  description: "What ZAVQERA stores, where it is stored, and what you can ask for.",
};

const LAST_UPDATED = "5 November 2026";

export default function PrivacyPage() {
  return <div className="container legal-page">
    <p className="eyebrow"><LocalizedText en="Privacy" /></p>
    <h1>Privacy notice</h1>
    <p className="legal-lead">
      This notice describes what ZAVQERA stores about you, where it is stored, and what you can ask us to do with it.
      It is written in English only: a mistranslated data or liability clause would be worse than one you read in a
      second language.
    </p>
    <p className="legal-meta">Last updated: {LAST_UPDATED}</p>

    <section>
      <h2>Who is responsible</h2>
      <p>
        ZAVQERA is operated by the account holder named on this deployment, who is the data controller for the
        purposes of the EU and UK General Data Protection Regulation. Contact for any privacy question or request:{" "}
        <strong>[contact email — replace before launch]</strong>.
      </p>
    </section>

    <section>
      <h2>What is stored, and why</h2>
      <ul className="list">
        <li>
          <strong>Your email address</strong>, so you can sign in and so we can send you a password reset link when
          you ask for one. Legal basis: performance of the contract you enter by creating an account.
        </li>
        <li>
          <strong>Your password</strong>, stored only as a cryptographic hash by our authentication provider. We never
          see, store or transmit your password in readable form.
        </li>
        <li>
          <strong>What you write into a Mission</strong> — its name, intent, success criteria, steps, follow-up dates,
          verification notes and outcomes. This is the content of the service; without it there is nothing to show you.
        </li>
      </ul>
      <p>
        We do not collect analytics, we do not use advertising or tracking cookies, we do not profile you, and we do
        not sell or share your data with anyone for their own purposes. At the time of writing there is no analytics
        product of any kind in this application; you can verify that in the source.
      </p>
    </section>

    <section>
      <h2>Where it is stored</h2>
      <p>
        Account and Mission data are held in a managed PostgreSQL database operated by Supabase in the{" "}
        <strong>eu-west-1 region (Ireland)</strong>, inside the European Economic Area. The application itself is
        served by Netlify. Both act as processors on our instructions.
      </p>
    </section>

    <section>
      <h2>What stays only in your browser</h2>
      <p>
        <strong>Opportunity Intelligence</strong> — the opportunities you score and the evidence notes you attach —
        is stored in your own browser under the key <code>zavqera.opportunity-intelligence.v1</code> and is never sent
        to our servers. It is not backed up by us, it does not follow you to another device, and clearing your browser
        data deletes it. Use the export button if you want a copy.
      </p>
    </section>

    <section>
      <h2>Cookies</h2>
      <ul className="list">
        <li>
          <strong>Session cookies</strong> set by our authentication provider, which keep you signed in. Strictly
          necessary: without them the service cannot tell one signed-in person from another.
        </li>
        <li>
          <strong><code>zavqera-language</code></strong> and <strong><code>zavqera-theme</code></strong>, which
          remember the language and the light or dark setting you chose. They last one year and hold nothing but that
          choice.
        </li>
      </ul>
      <p>There are no analytics, advertising or third-party tracking cookies, which is why this site shows no cookie banner.</p>
    </section>

    <section>
      <h2>Artificial intelligence</h2>
      <p>
        The plan suggestions and the review of what you have written are produced on our own servers by rules in our
        source code. Nothing you type is sent to an AI provider to generate them.
      </p>
      <p>
        A separate server-side AI analyst exists in the codebase for the Opportunity Brief. It is switched off and
        restricted to approved testers. If it is ever enabled for your account, the text you submit for analysis would
        be sent to the AI provider named at that time, and this notice will be updated before that happens.
      </p>
    </section>

    <section>
      <h2>How long it is kept</h2>
      <p>
        Mission data is kept until you delete it or ask us to close your account. Some Missions keep a historical
        record of what was decided and verified, which is the point of the product; deleting a Mission removes it from
        your workspace. Backups, where they exist, are retained for a limited period by our database provider and then
        overwritten.
      </p>
    </section>

    <section>
      <h2>Your rights</h2>
      <p>
        Under the GDPR you may ask for a copy of your data, ask for it to be corrected or erased, ask us to restrict
        or stop a particular use, and ask for it in a portable form. Write to the contact address above and we will
        answer within one month.
      </p>
      <p>
        If you are not satisfied with how we handle a request, you may complain to your national supervisory
        authority. In Norway this is Datatilsynet.
      </p>
    </section>

    <section>
      <h2>Changes</h2>
      <p>
        When this notice changes materially we will update the date above and, where the change affects how your data
        is used, tell you in the application before it takes effect.
      </p>
    </section>

    <p className="legal-footer-links">
      <Link className="button button-quiet" href="/terms"><LocalizedText en="Terms of service" /></Link>
      <Link className="button button-quiet" href="/"><LocalizedText en="Home" /></Link>
    </p>
  </div>;
}
