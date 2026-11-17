// One place for the facts the legal pages state, so a change to the company
// details or the processors cannot leave one page saying something the other
// contradicts. These are deliberately not translated: see the note on each
// page about why the legal text is English only.

/** Replace every PLACEHOLDER before launch. They are marked so they cannot be missed. */
export const LEGAL = {
  /** The controller. Norwegian sole traders use their own name until a company exists. */
  controllerName: "Abdul Rahman Ataia, trading as ZAVQERA",
  controllerAddress: "Norway",
  /** Empty until a business is registered; the line is then left out. */
  organisationNumber: "",
  privacyEmail: "hello@zavqera.com",
  supportEmail: "hello@zavqera.com",

  /** Updated whenever either document changes materially. */
  lastUpdated: "17 November 2026",

  /** Supervisory authority for a controller established in Norway. */
  authority: {
    name: "Datatilsynet",
    postal: "Postboks 458 Sentrum, 0105 Oslo, Norway",
    email: "postkasse@datatilsynet.no",
    web: "https://www.datatilsynet.no/",
  },

  /** Consumer bodies a Norwegian consumer may turn to over a contract dispute. */
  consumerBodies: [
    { name: "Forbrukertilsynet", web: "https://www.forbrukertilsynet.no/" },
    { name: "Forbrukerrådet", web: "https://www.forbrukerradet.no/" },
  ],
} as const;

/** A value still carrying its bracketed marker has not been filled in. */
export function isPlaceholder(value: string): boolean {
  return /^\[.*\]$/.test(value.trim());
}

/**
 * The legal pages are published as soon as the site is. Until the controller's
 * own details are filled in they would otherwise show a raw bracket to any
 * visitor, which reads as a broken page rather than an unfinished one. The
 * pages check this and say plainly that the notice is not yet in force.
 */
export function legalDetailsPending(): boolean {
  return [LEGAL.controllerName, LEGAL.controllerAddress, LEGAL.privacyEmail, LEGAL.supportEmail]
    .some(isPlaceholder);
}

export type Processor = {
  name: string;
  role: string;
  location: string;
  transfer: string;
};

/**
 * Everyone who handles personal data on our instructions. Article 13(1)(e)
 * requires the recipients to be named or described; naming them is the version
 * a reader can actually act on.
 */
export const PROCESSORS: Processor[] = [
  {
    name: "Supabase",
    role: "Database and authentication: your email address, your password hash, everything you write into a Mission, and the opportunities and evidence notes you record.",
    location: "eu-west-1 (Ireland) — inside the EEA",
    transfer: "No transfer outside the EEA for stored data.",
  },
  {
    name: "Netlify",
    role: "Hosting and delivery of the application. Processes request data such as IP addresses in transit in order to serve pages.",
    location: "United States, with a global delivery network",
    transfer: "Covered by the EU Standard Contractual Clauses in Netlify's data processing agreement.",
  },
  {
    name: "Umami",
    role: "Visitor statistics for the public pages (Umami Cloud). Receives the address of the public page you opened, the domain of the website that linked you here, your screen size, your browser language and the page title, and, as with any request your browser makes, your IP address and browser details in transit.",
    location: "Umami Software, Inc. is established in the United States",
    transfer: "A transfer outside the EEA, under Umami's data processing agreement.",
  },
  {
    name: "Resend",
    role: "Sends the emails ZAVQERA sends: account confirmation, password reset and workspace invitations. Receives the address the email goes to and what the email says, which for an invitation includes the email address of the person who sent it.",
    location: "Sending from eu-west-1 (Ireland); Resend, Inc. is established in the United States",
    transfer: "A transfer outside the EEA is possible, under Resend's data processing agreement.",
  },
  {
    name: "OpenAI",
    role: "Generates AI Mission plans and AI opportunity briefs when you ask for one. Receives the text of the Mission or opportunity the request is about, not your email address or name.",
    location: "OpenAI is established in the United States",
    transfer: "A transfer outside the EEA, under OpenAI's data processing addendum.",
  },
  {
    name: "Stripe",
    role: "Takes payment for paid plans and keeps the subscription. Receives your email address, the plan you choose, the name and billing address you give it, and the card or other payment details you enter on Stripe's own checkout page. ZAVQERA never receives your card number.",
    location: "Stripe Payments Europe, Ltd. (Ireland), part of Stripe, Inc. (United States)",
    transfer: "A transfer outside the EEA is possible, under Stripe's data processing agreement.",
  },
];

export type PurposeRow = {
  purpose: string;
  data: string;
  /** Article 6(1) letter, written out so a reader does not need the regulation open. */
  basis: string;
  retention: string;
};

/**
 * Article 13(1)(c) wants the purpose and the legal basis for each. A single
 * sentence covering everything at once is the usual way this is got wrong.
 */
export const PURPOSES: PurposeRow[] = [
  {
    purpose: "Creating and running your account, and signing you in",
    data: "Email address, password hash",
    basis: "Article 6(1)(b) — necessary to perform the contract you enter by creating an account",
    retention: "Until you close the account, then deleted within 30 days",
  },
  {
    purpose: "Storing and showing you your Missions",
    data: "Mission name, intent, success criteria, steps, follow-up dates, verification notes and outcomes",
    basis: "Article 6(1)(b) — this is the service itself",
    retention: "Until you delete the Mission or close the account",
  },
  {
    purpose: "Storing and showing you your opportunities in Opportunity Intelligence",
    data: "Opportunity name, who it is for, thesis, source link, your five ratings, and the evidence notes you attach (source link, title, your observation, source type, dates and your reliability rating)",
    basis: "Article 6(1)(b) — this is the service itself",
    retention: "Until you remove the opportunity or close the account",
  },
  {
    purpose: "Sending a password reset link when you ask for one",
    data: "Email address",
    basis: "Article 6(1)(b) — part of operating your account",
    retention: "Reset links expire; no separate record is kept",
  },
  {
    purpose: "Charging for a paid plan",
    data: "Email address, the plan, Stripe's customer and subscription references, whether each payment succeeded, and the invoices Stripe keeps",
    basis: "Article 6(1)(b) — necessary for the subscription you buy. Payment records are also kept because bookkeeping law requires it (Article 6(1)(c))",
    retention: "While the subscription runs, and payment records for as long as bookkeeping law requires",
  },
  {
    purpose: "Inviting someone to work in your workspace",
    data: "The invited email address, the access you chose, who sent the invitation and when, and whether it was accepted, revoked or expired. Everyone in a workspace can see the email addresses of the others in it",
    basis: "Article 6(1)(f) — the legitimate interest of the person inviting, and ours, in letting a team work together. The invited person can ignore the email; nothing further is sent",
    retention: "Kept with the workspace until its owner closes their account",
  },
  {
    purpose: "Keeping the service available and investigating faults",
    data: "Server and request logs held by our hosting and database providers, which can include IP addresses",
    basis: "Article 6(1)(f) — our legitimate interest in a service that works and is not abused",
    retention: "Held by those providers for a limited period under their own retention rules",
  },
  {
    purpose: "Telling you when a plan you asked about becomes available",
    data: "The email address you gave on the pricing page, which plan you asked about, and the exact sentence you agreed to",
    basis: "Article 6(1)(a) — your consent, given by submitting that form. You may withdraw it at any time by writing to us, and we delete the address",
    retention: "Until we have sent that one message, or you ask us to delete it, or 24 months pass without the plan opening",
  },
  {
    purpose: "Counting how many times each page was opened",
    data: "The page path, the date, and the website that linked here. No identifier of any kind, and nothing is stored on your device",
    basis: "Article 6(1)(f) — our legitimate interest in knowing whether the service is used. Because no one is identified, this does not single you out",
    retention: "Daily totals only, kept for 24 months",
  },
  {
    purpose: "Seeing how the public pages are found and used, with Umami",
    data: "Address of the public page, domain of the referring website, screen size, browser language, page title; IP address and browser details in transit. Nothing from the signed-in workspace",
    basis: "Article 6(1)(f) — our legitimate interest in knowing whether the public pages are found and used",
    retention: "Until we delete the statistics from Umami or close that account",
  },
];
