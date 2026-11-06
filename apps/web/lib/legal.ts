// One place for the facts the legal pages state, so a change to the company
// details or the processors cannot leave one page saying something the other
// contradicts. These are deliberately not translated: see the note on each
// page about why the legal text is English only.

/** Replace every PLACEHOLDER before launch. They are marked so they cannot be missed. */
export const LEGAL = {
  /** The controller. Norwegian sole traders use their own name until a company exists. */
  controllerName: "[CONTROLLER NAME — replace before launch]",
  controllerAddress: "[POSTAL ADDRESS, NORWAY — replace before launch]",
  organisationNumber: "[ORGANISATION NUMBER, if registered — otherwise remove this line]",
  privacyEmail: "[privacy@zavqera.com — replace before launch]",
  supportEmail: "[support@zavqera.com — replace before launch]",

  /** Updated whenever either document changes materially. */
  lastUpdated: "6 November 2026",

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
    role: "Database and authentication: your email address, your password hash, and everything you write into a Mission.",
    location: "eu-west-1 (Ireland) — inside the EEA",
    transfer: "No transfer outside the EEA for stored data.",
  },
  {
    name: "Netlify",
    role: "Hosting and delivery of the application. Processes request data such as IP addresses in transit in order to serve pages.",
    location: "United States, with a global delivery network",
    transfer: "Covered by the EU Standard Contractual Clauses in Netlify's data processing agreement.",
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
    purpose: "Sending a password reset link when you ask for one",
    data: "Email address",
    basis: "Article 6(1)(b) — part of operating your account",
    retention: "Reset links expire; no separate record is kept",
  },
  {
    purpose: "Keeping the service available and investigating faults",
    data: "Server and request logs held by our hosting and database providers, which can include IP addresses",
    basis: "Article 6(1)(f) — our legitimate interest in a service that works and is not abused",
    retention: "Held by those providers for a limited period under their own retention rules",
  },
  {
    purpose: "Counting how many times each page was opened",
    data: "The page path, the date, and the website that linked here. No identifier of any kind, and nothing is stored on your device",
    basis: "Article 6(1)(f) — our legitimate interest in knowing whether the service is used. Because no one is identified, this does not single you out",
    retention: "Daily totals only, kept for 24 months",
  },
];
