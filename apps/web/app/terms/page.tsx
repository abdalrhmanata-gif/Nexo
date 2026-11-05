import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";

// English only for the same reason as the privacy notice. The clause that
// matters most here is the one about suggestions: this product proposes steps
// for opening regulated businesses and for moving between countries, and it
// must be unmistakable that those are prompts to go and find out, not advice.

export const metadata = {
  title: "Terms — ZAVQERA",
  description: "The terms you agree to when you use ZAVQERA.",
};

const LAST_UPDATED = "5 November 2026";

export default function TermsPage() {
  return <div className="container legal-page">
    <p className="eyebrow"><LocalizedText en="Terms" /></p>
    <h1>Terms of service</h1>
    <p className="legal-lead">
      These terms apply when you create an account and use ZAVQERA. They are written in English only, for the same
      reason as the privacy notice: a mistranslated clause here would bind you to something nobody intended.
    </p>
    <p className="legal-meta">Last updated: {LAST_UPDATED}</p>

    <section>
      <h2>What the service is</h2>
      <p>
        ZAVQERA is a tool for stating an outcome, recording the work intended to reach it, and keeping the evidence
        that it was reached. It organises your own thinking. It does not perform the work, and it does not act on your
        behalf outside the application.
      </p>
    </section>

    <section>
      <h2>Suggestions are prompts, not advice</h2>
      <p>
        The service proposes plans and comments on what you have written, including for regulated activities such as
        opening a pharmacy or a clinic, moving between countries, or committing to a course of study.{" "}
        <strong>
          None of it is legal, financial, medical, immigration or other professional advice, and none of it states
          what any law, authority, price or market actually requires.
        </strong>{" "}
        Every suggestion is deliberately phrased as something for you to go and verify with the responsible authority
        or a qualified professional. Decisions you take remain yours.
      </p>
    </section>

    <section>
      <h2>Your account</h2>
      <p>
        You are responsible for keeping your password secret and for everything done through your account. Tell us
        promptly if you believe someone else has access to it. One account is for one person; do not share
        credentials.
      </p>
    </section>

    <section>
      <h2>Your content</h2>
      <p>
        What you write stays yours. You grant us only the permission needed to store it, display it back to you and
        operate the service. We do not use your Missions to train models, and we do not publish them.
      </p>
    </section>

    <section>
      <h2>Acceptable use</h2>
      <p>Do not use the service to break the law, to infringe someone else&rsquo;s rights, to store another person&rsquo;s personal data without a lawful basis, or to attack, probe or overload the infrastructure it runs on.</p>
    </section>

    <section>
      <h2>Availability, and the stage this product is at</h2>
      <p>
        The service is provided as it is, without warranty that it will be uninterrupted, error-free or fit for any
        particular purpose. Parts of it are explicitly marked as planned or not yet enabled, and those parts may
        change or not arrive. Keep your own copy of anything you cannot afford to lose.
      </p>
    </section>

    <section>
      <h2>Payment</h2>
      <p>
        No paid plan is currently available for purchase, and no payment details are collected. The prices shown on
        the pricing page are proposed, not active offers. If paid plans are introduced, the terms of any subscription
        will be presented to you before you are asked to pay anything.
      </p>
    </section>

    <section>
      <h2>Ending it</h2>
      <p>
        You may stop using the service and ask for your account to be closed at any time. We may suspend or close an
        account that breaches these terms, and will say why unless the law prevents it.
      </p>
    </section>

    <section>
      <h2>Liability</h2>
      <p>
        Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for
        anything else that cannot lawfully be limited. Subject to that, we are not liable for indirect or
        consequential loss, lost profits, or for decisions taken on the basis of suggestions the service made.
      </p>
    </section>

    <section>
      <h2>Governing law</h2>
      <p>
        These terms are governed by Norwegian law, and the courts of Norway have jurisdiction. If you use the service
        as a consumer, this does not remove the protection of mandatory consumer law in the country where you live.
      </p>
    </section>

    <p className="legal-footer-links">
      <Link className="button button-quiet" href="/privacy"><LocalizedText en="Privacy notice" /></Link>
      <Link className="button button-quiet" href="/"><LocalizedText en="Home" /></Link>
    </p>
  </div>;
}
