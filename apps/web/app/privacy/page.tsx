import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";
import { LEGAL, PROCESSORS, PURPOSES, legalDetailsPending } from "../../lib/legal";

// Deliberately English only, and the page says so. A mistranslated data or
// liability clause binds a reader to something nobody intended, and this is
// the one text in the product where being approximately right is not good
// enough.
//
// Every factual claim here is drawn from the code: the cookie names, the
// browser storage key, the region the database runs in, the absence of any
// tracker. Tests in test/navigation-regression.test.mjs hold those claims to
// the source, so the notice cannot quietly drift away from the product.

export const metadata = {
  title: "Privacy notice — ZAVQERA",
  description: "What ZAVQERA collects, the legal basis for each use, who processes it, how long it is kept, and your rights.",
};

export default function PrivacyPage() {
  return <div className="container legal-page">
    <p className="eyebrow"><LocalizedText en="Privacy" /></p>
    <h1>Privacy notice</h1>
    <p className="legal-lead">
      This notice explains what personal data ZAVQERA collects, why, on what legal basis, who else handles it, how
      long it is kept, and what you can require of us. It is given under Articles 13 and 14 of the General Data
      Protection Regulation as it applies in Norway through the Personal Data Act (personopplysningsloven).
    </p>
    {legalDetailsPending() && <p className="legal-pending" role="status">
      <strong>This document is not yet in force.</strong> The service is not open to users, and the
      operator&rsquo;s own details below are still unfilled — anything shown in square brackets is a
      placeholder, not a value. It will be completed, and dated, before anyone is invited to create an account.
    </p>}
    <p className="legal-meta">Last updated: {LEGAL.lastUpdated} · English only — see “Language” below</p>

    <section>
      <h2>1. Who is responsible</h2>
      <p>The controller for the processing described here is:</p>
      <ul className="list">
        <li>{LEGAL.controllerName}</li>
        <li>{LEGAL.controllerAddress}</li>
        <li>{LEGAL.organisationNumber}</li>
        <li>Privacy contact: <strong>{LEGAL.privacyEmail}</strong></li>
      </ul>
      <p>
        We have not appointed a Data Protection Officer. We are not required to: we do not carry out large-scale
        monitoring and we do not process special categories of data as a core activity. Privacy questions go to the
        address above and are answered by the controller.
      </p>
    </section>

    <section>
      <h2>2. What we collect, why, and on what basis</h2>
      <p>Each purpose has its own legal basis. We do not rely on a single blanket justification.</p>
      <div className="legal-table-scroll">
        <table className="legal-table">
          <thead>
            <tr><th>Purpose</th><th>Data</th><th>Legal basis</th><th>Kept for</th></tr>
          </thead>
          <tbody>
            {PURPOSES.map((row) => <tr key={row.purpose}>
              <td>{row.purpose}</td>
              <td>{row.data}</td>
              <td>{row.basis}</td>
              <td>{row.retention}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p>
        <strong>Is providing it optional?</strong> An email address and a password are required to have an account;
        without them we cannot create one. Everything you write into a Mission is entirely your choice, and a Mission
        can hold as little as you like.
      </p>
      <p>
        <strong>What we do not do.</strong> We do not sell personal data. We do not share it for anyone else&rsquo;s
        own purposes. We do not profile you, build an advertising audience, or combine your data with data bought from
        elsewhere. We do not use your Missions to train machine-learning models.
      </p>
    </section>

    <section>
      <h2>3. Who else handles it</h2>
      <p>
        These are our processors. They act only on our documented instructions, under a data processing agreement, and
        may not use your data for themselves.
      </p>
      <div className="legal-table-scroll">
        <table className="legal-table">
          <thead><tr><th>Processor</th><th>What it does</th><th>Where</th><th>Transfers</th></tr></thead>
          <tbody>
            {PROCESSORS.map((processor) => <tr key={processor.name}>
              <td><strong>{processor.name}</strong></td>
              <td>{processor.role}</td>
              <td>{processor.location}</td>
              <td>{processor.transfer}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p>
        We may also disclose data where the law requires it, or to establish or defend a legal claim. If that ever
        happens we will tell you unless we are forbidden to.
      </p>
    </section>

    <section>
      <h2>4. What never reaches us</h2>
      <p>
        <strong>Opportunity Intelligence</strong> — the opportunities you score and the evidence notes you attach —
        is held in your own browser under the key <code>zavqera.opportunity-intelligence.v1</code>. It is not
        transmitted to our servers, not included in any backup we hold, and not visible to us. It does not follow you
        to another device, and clearing your browser data erases it. Export a backup file if you want a copy you
        control.
      </p>
    </section>

    <section>
      <h2>5. Cookies and your device</h2>
      <p>
        Norwegian law (ekomloven § 2-7b, implementing the ePrivacy Directive) requires consent before storing or
        reading information on your device, unless it is strictly necessary for a service you asked for. We store
        three things, and all three are strictly necessary or set by your own choice:
      </p>
      <ul className="list">
        <li>
          <strong>Session cookies</strong> set by our authentication provider, which keep you signed in. Without them
          the service cannot tell one signed-in person from another.
        </li>
        <li>
          <strong><code>zavqera-language</code></strong> — the language you selected. One year.
        </li>
        <li>
          <strong><code>zavqera-theme</code></strong> — the light or dark setting you selected. One year.
        </li>
      </ul>
      <p>
        There are no advertising cookies, no third-party trackers, and no analytics script of any kind. Our page
        counting is described below and touches nothing on your device, which is why this site shows no cookie banner:
        there is no consent to ask for.
      </p>
    </section>

    <section>
      <h2>6. How we count visits</h2>
      <p>
        We record, on our own servers, how many times each page was opened on each day and which website linked here.
        That is the whole record. We do not store an IP address against it, we do not set a cookie or identifier, we
        do not fingerprint your browser, and nothing is written to your device. The result is a daily total per page —
        it cannot be traced to you, and we could not single you out from it if we tried.
      </p>
      <p>
        We do this to know whether anyone is using the service and which parts are reached, on the basis of our
        legitimate interest under Article 6(1)(f). Because no one is identified, this processing does not affect your
        rights and freedoms; you may still object using the contact address above.
      </p>
    </section>

    <section>
      <h2>7. Artificial intelligence and automated decisions</h2>
      <p>
        The plan suggestions and the review of what you have written are produced by rules in our own source code,
        running on our own servers. Nothing you type is sent to an AI provider to generate them.
      </p>
      <p>
        A separate server-side AI analyst exists in the codebase for the Opportunity Brief. It is switched off and
        restricted to approved testers. If it is ever enabled for your account, the text you submit would be sent to
        the AI provider named at that time, and this notice will be updated and you will be told before that happens.
      </p>
      <p>
        <strong>No automated decision-making.</strong> Nothing here produces a decision with legal or similarly
        significant effects for you within the meaning of Article 22. Suggestions are proposals you are free to
        ignore, and no outcome is applied to you automatically.
      </p>
    </section>

    <section>
      <h2>8. How long we keep it</h2>
      <p>
        The retention period for each purpose is in the table in section 2. In addition: closing your account deletes
        your account record and your Missions within 30 days. Copies may persist in our database provider&rsquo;s
        backups for a limited further period before being overwritten, and we cannot selectively erase a backup.
        Server logs held by our providers follow their own retention rules.
      </p>
    </section>

    <section>
      <h2>9. Security</h2>
      <p>
        Data is encrypted in transit. Passwords are stored only as a cryptographic hash and are never visible to us.
        Access to the database is restricted at the row level so that one account cannot read another&rsquo;s data,
        and those rules deny by default rather than allow by default.
      </p>
      <p>
        If a breach occurs that is likely to result in a risk to your rights and freedoms, we will notify Datatilsynet
        within 72 hours of becoming aware of it, and tell you directly where the risk is high.
      </p>
    </section>

    <section>
      <h2>10. Your rights</h2>
      <p>You may ask us to:</p>
      <ul className="list">
        <li><strong>Give you a copy</strong> of the personal data we hold about you (Article 15).</li>
        <li><strong>Correct</strong> anything inaccurate or incomplete (Article 16).</li>
        <li><strong>Erase</strong> it (Article 17).</li>
        <li><strong>Restrict</strong> how we use it while a dispute is resolved (Article 18).</li>
        <li><strong>Send it on</strong> to you or another provider in a machine-readable form (Article 20).</li>
        <li>
          <strong>Object</strong> to any use we base on legitimate interest, including the page counting in section 6
          (Article 21).
        </li>
      </ul>
      <p>
        Write to {LEGAL.privacyEmail}. We answer within one month, and will say so if a request is complex enough to
        need the two-month extension the regulation allows. Exercising these rights is free; we will only charge, or
        refuse, where a request is manifestly unfounded or excessive, and we will explain why.
      </p>
      <p>
        You may also complain to the supervisory authority. For a controller established in Norway that is{" "}
        <strong>{LEGAL.authority.name}</strong>, {LEGAL.authority.postal} — {LEGAL.authority.email} —{" "}
        <a href={LEGAL.authority.web} rel="noreferrer noopener" target="_blank">{LEGAL.authority.web}</a>. You may
        instead complain to the authority in the EEA country where you live.
      </p>
    </section>

    <section>
      <h2>11. Children</h2>
      <p>
        This service is intended for adults and is not directed at children. You must be 18 or over to create an
        account, as the terms of service require. We do not knowingly collect data from children; if you believe a
        child has created an account, write to {LEGAL.privacyEmail} and we will delete it.
      </p>
    </section>

    <section>
      <h2>12. Language</h2>
      <p>
        The application is available in six languages. This notice and the terms of service are published in English
        only, and the English text governs. A mistranslated clause about data or liability would bind a reader to
        something nobody intended, which we consider worse than asking you to read two pages in a second language. If
        anything here is unclear, write to {LEGAL.privacyEmail} and we will explain it in your language.
      </p>
    </section>

    <section>
      <h2>13. Changes</h2>
      <p>
        When this notice changes materially we update the date at the top and, where the change affects how your data
        is used, tell you inside the application before it takes effect. Continuing to use the service after that
        means the current version applies.
      </p>
    </section>

    <p className="legal-footer-links">
      <Link className="button button-quiet" href="/terms"><LocalizedText en="Terms of service" /></Link>
      <Link className="button button-quiet" href="/"><LocalizedText en="Home" /></Link>
    </p>
  </div>;
}
