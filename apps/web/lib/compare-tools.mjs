// Comparison pages: ZAVQERA next to other checklist tools a small team might
// already use or be looking at (/compare/zavqera-vs-<tool>).
//
// Written for people who search "<tool> alternative" or "<tool> vs ...", and
// for the AI assistants that answer those questions from structured
// comparisons. A wrong claim about another company's product costs more
// trust than the page earns, so (checked by test/compare-tools.test.mjs):
// - every statement about the other product cites a source, and every
//   source is a page on that company's own website;
// - the date the sources were read is recorded, and the page shows it;
// - nothing claims ZAVQERA does something it does not do. What it lacks is
//   listed on the page: no file uploads, no approvals, no automatic
//   recurrence, no Zapier or Slack;
// - ZAVQERA's prices come from the same data as /pricing.
//
// English only, like the checklists: the people searching are in the US and
// the UK. Types: lib/compare-tools.d.mts.

import { checklists } from "./checklists.mjs";
import { PLAN_PRICES_USD } from "./site-schema.mjs";

const { Plus, Pro, Scale } = PLAN_PRICES_USD;
const PAID = `$${Plus}, $${Pro} or $${Scale} a month`;

/** What ZAVQERA does and does not do, said the same way on every page. */
export const ZAVQERA_FACTS = Object.freeze({
  price: `Free plan with no card. Paid plans are ${PAID}, shown on the pricing page.`,
  team: "Invite your team on any plan, the Free plan included. A paid plan belongs to one person and adds AI drafts and, from Pro, your own templates; teammates do not need one.",
  owners: "One owner from your team and a due date on each step. The new owner gets an email, late steps are marked, and everyone sees what is assigned to them.",
  proof: "A short note and a link on each step, saved when it is marked done. No file uploads: link to the file where you already keep it.",
  checklists: `${checklists.length} ready-made checklists, such as employee onboarding, month-end close and quarterly access reviews. Every step says what proof to keep.`,
  ai: "Works inside AI assistants through the Model Context Protocol, so a plan made in a chat becomes a checklist. Its own AI drafts steps only when you ask.",
  gaps: [
    "No file uploads. Proof is a note and a link.",
    "No approval workflow.",
    "No automatic recurrence. From the Pro plan you save a finished checklist as your own template and start the next run in one click.",
    "No Zapier, Slack or Microsoft Teams integration.",
  ],
});

export const TOOL_COMPARISONS = [
  {
    slug: "zavqera-vs-process-street",
    competitor: "Process Street",
    owner: "Process Street",
    hosts: ["www.process.st"],
    checked: "2026-11-26",
    metaTitle: "ZAVQERA vs Process Street for Small Team Checklists",
    metaDescription: "Process Street is a workflow platform with approvals, form fields and automations. ZAVQERA is a simpler checklist app with a free plan and public prices.",
    title: "ZAVQERA vs Process Street: checklists for a small team",
    lead: [
      "Short answer: choose Process Street when you need approvals, form fields, file uploads and automations across a company. Choose ZAVQERA when a small team wants every step to have an owner, a due date and proof, on a free plan with prices it can see.",
      "Both turn work you repeat into a checklist that someone runs. They differ in size: Process Street is a workflow platform sold through its sales team; ZAVQERA does fewer things and shows its prices.",
    ],
    sources: {
      pricing: { label: "Process Street: Pricing", url: "https://www.process.st/pricing/" },
    },
    rows: [
      { feature: "Prices you can see", them: "Not on the pricing page: every plan says \"Contact sales\".", source: "pricing", zavqera: "price" },
      { feature: "Free plan", them: "No free plan. New accounts get a 14-day trial of the Pro plan, no credit card required.", source: "pricing", zavqera: "Yes, with no card. Every checklist, step, owner, due date and proof feature is on it." },
      { feature: "People on the team", them: "The Startup plan has 5 users and 10 guests; Pro and Enterprise are custom.", source: "pricing", zavqera: "team" },
      { feature: "Proof when a step is done", them: "Form fields and file storage: 5MB per file on Startup, 100MB on Pro.", source: "pricing", zavqera: "proof" },
      { feature: "Approvals", them: "Yes, on every plan.", source: "pricing", zavqera: "No approval workflow." },
      { feature: "Integrations", them: "A Zapier connector and a Slack app on every plan.", source: "pricing", zavqera: "ai" },
    ],
    theyDoWell: [
      { text: "Approvals, form fields and file storage are on every plan.", source: "pricing" },
      { text: "A Zapier connector and a Slack app connect it to the tools a company already runs.", source: "pricing" },
      { text: "Businesses with fewer than 15 employees and under $2 million in revenue can ask for a reduced price on the Pro plan.", source: "pricing" },
    ],
    choose: {
      them: "your process needs approvals, form fields, uploaded files or automations, or more than a few teams run it.",
      zavqera: "a small team wants to see who owns each step, what is late and what proves it was done, and wants to start free today.",
    },
    faqs: [
      { question: "Is ZAVQERA a Process Street alternative?", answer: "For a small team that needs owners, due dates and proof on each step, yes. If you rely on approvals, form fields, file uploads or automations, Process Street does those and ZAVQERA does not." },
      { question: "Can my whole team use ZAVQERA for free?", answer: "Yes. Invite your team on the Free plan. A paid plan adds AI drafts for the person who has it; checklists, owners, due dates and proof are on every plan." },
      { question: "Does ZAVQERA store files?", answer: "No. Proof on a step is a short note and a link, so you link to the file where you already keep it, for example in Google Drive or SharePoint." },
    ],
  },
  {
    slug: "zavqera-vs-trello",
    competitor: "Trello",
    owner: "Atlassian",
    hosts: ["trello.com"],
    checked: "2026-11-26",
    metaTitle: "ZAVQERA vs Trello for Checklists With Owners and Proof",
    metaDescription: "Trello's free plan has checklists, but an owner and due date on each checklist item needs Standard. Here is how ZAVQERA compares for small teams.",
    title: "ZAVQERA vs Trello for checklists with an owner on every step",
    lead: [
      "Short answer: Trello is a board of cards you move from list to list. ZAVQERA is a checklist where every step has an owner, a due date and proof. If your team already works in Trello and simple checklists are enough, stay. If each step needs a person, a date and a record that it was done, read on.",
      "The difference shows up inside a card: in Trello, assigning a person and a due date to each checklist item is part of Advanced checklists, which starts on the Standard plan.",
    ],
    sources: {
      pricing: { label: "Trello: Pricing", url: "https://trello.com/pricing" },
    },
    rows: [
      { feature: "Price", them: "Free for up to 10 collaborators per Workspace. Standard is $5 per user a month billed annually, or $6 billed monthly.", source: "pricing", zavqera: "price" },
      { feature: "An owner and a due date on each checklist item", them: "Advanced checklists, which assign members and due dates to individual items, are a Standard feature.", source: "pricing", zavqera: "Yes, on every plan, the Free plan included." },
      { feature: "An owner and a due date on the whole task", them: "Yes on Free: assignee and due dates on a card.", source: "pricing", zavqera: "owners" },
      { feature: "Proof when a step is done", them: "File attachments on a card: 10MB per file on Free, 250MB on Standard.", source: "pricing", zavqera: "proof" },
      { feature: "People on the team", them: "Up to 10 collaborators per Workspace on Free.", source: "pricing", zavqera: "team" },
      { feature: "Ready-made checklists", them: "Not compared here.", zavqera: "checklists" },
    ],
    theyDoWell: [
      { text: "Boards, unlimited cards and unlimited Power-Ups per board on the Free plan.", source: "pricing" },
      { text: "iOS and Android apps, and to-dos captured from email and Slack.", source: "pricing" },
    ],
    choose: {
      them: "your work moves through stages on a board, and a simple checklist inside a card is enough.",
      zavqera: "each step of a process needs its own owner, due date and proof, without paying per person for it.",
    },
    faqs: [
      { question: "Can I assign checklist items to people in Trello for free?", answer: "Trello's pricing page lists Advanced checklists, which assign members and due dates to individual checklist items, under the Standard plan. In ZAVQERA every step has an owner and a due date on the Free plan." },
      { question: "Should I move from Trello to ZAVQERA?", answer: "Not for everything. Keep Trello for boards and moving cards through stages. Use ZAVQERA for the processes you repeat, such as onboarding or closing the month, where each step needs an owner and proof." },
      { question: "Does ZAVQERA have boards?", answer: "No. ZAVQERA shows each checklist as an ordered list of steps with owners, due dates and proof, and a list of the steps assigned to you." },
    ],
  },
  {
    slug: "zavqera-vs-manifestly",
    competitor: "Manifestly",
    owner: "Manifestly Checklists",
    hosts: ["www.manifest.ly"],
    checked: "2026-11-26",
    metaTitle: "ZAVQERA vs Manifestly Checklists for Small Teams",
    metaDescription: "Manifestly is $10 per user a month with file uploads, scheduling and integrations. ZAVQERA has a free plan, and teammates do not pay per seat.",
    title: "ZAVQERA vs Manifestly: recurring checklists for a small team",
    lead: [
      "Short answer: Manifestly is built for checklists that run on a schedule, with data fields, file uploads and integrations, priced per user. ZAVQERA gives every step an owner, a due date and proof, with a free plan your whole team can use.",
      "If your checklists must start on their own every week or month, Manifestly does that and ZAVQERA does not. If you start each run yourself and care most about who owns what and what proves it, compare the prices first.",
    ],
    sources: {
      pricing: { label: "Manifestly: Pricing", url: "https://www.manifest.ly/pricing" },
    },
    rows: [
      { feature: "Price", them: "Business is $10 per user a month, or $100 per user a year. Enterprise starts at $2,000 a year with 10 users.", source: "pricing", zavqera: "price" },
      { feature: "Free plan", them: "No free plan; a 14-day free trial of Business.", source: "pricing", zavqera: "Yes, with no card. Every checklist, step, owner, due date and proof feature is on it." },
      { feature: "Who does each step, and when", them: "Role-based assignments and scheduling.", source: "pricing", zavqera: "owners" },
      { feature: "Proof when a step is done", them: "Data collection fields and file uploads.", source: "pricing", zavqera: "proof" },
      { feature: "Integrations", them: "Slack, Microsoft Teams, Zapier, an API and webhooks.", source: "pricing", zavqera: "ai" },
    ],
    theyDoWell: [
      { text: "Checklists can be scheduled, with role-based assignments.", source: "pricing" },
      { text: "Data collection fields and file uploads on the Business plan.", source: "pricing" },
      { text: "Runs inside Slack and Microsoft Teams, and connects through Zapier, an API and webhooks.", source: "pricing" },
    ],
    choose: {
      them: "checklists must start on a schedule, you collect structured data or files on each step, or your team works in Slack or Teams all day.",
      zavqera: "you want owners, due dates and proof on every step without a per-user price, and your team starts each run itself.",
    },
    faqs: [
      { question: "Is ZAVQERA cheaper than Manifestly?", answer: `For a team, usually. Manifestly's Business plan is $10 per user a month. ZAVQERA's checklists, owners, due dates and proof are free for the whole team; paid plans are ${PAID} for one person and add AI drafts and, from Pro, your own templates.` },
      { question: "Can ZAVQERA run a checklist every month on its own?", answer: "No. There is no automatic recurrence. From the Pro plan you save a finished checklist as your own template and start the next run in one click." },
      { question: "Does ZAVQERA collect files on a step?", answer: "No. Proof is a short note and a link, so you link to the file where you already keep it." },
    ],
  },
];

/** Every word of the pages' frame, kept here with the content (English only, like lib/compare.ts). */
export const COMPARE_TOOLS_CHROME = Object.freeze({
  eyebrow: "Comparison",
  tableTitle: "Side by side",
  tableCaption: (date) => `What a small team gets, checked on ${date}`,
  featureColumn: "What you need",
  strengthsTitle: (name) => `What ${name} does well`,
  gapsTitle: "What ZAVQERA does not do",
  whenTitle: "Which one to use",
  chooseThem: (name) => `Choose ${name}`,
  chooseZavqera: "Choose ZAVQERA",
  ctaTitle: "Try it on one checklist you repeat",
  ctaBody: "Pick a ready-made checklist, give each step an owner and a due date, and keep the proof as your team works through it.",
  ctaPrimary: "Start free",
  ctaSecondary: "See the checklists",
  faqTitle: "Questions",
  moreTitle: "More comparisons",
  sourcesTitle: "Sources",
  disclosure: (item, date) => `Checked against ${item.competitor}'s own website on ${date}. Prices and plans change; the linked pages are the authority. Written by ZAVQERA. ${item.competitor} is a trademark of ${item.owner}; ZAVQERA is not affiliated with ${item.owner}.`,
  indexEyebrow: "Comparisons",
  indexTitle: "ZAVQERA compared",
  indexLead: "Each page says what the other tool does well, what ZAVQERA does not do, and links to the other company's own pages as sources.",
  indexMetaTitle: "ZAVQERA Compared With Other Checklist and AI Tools",
  indexMetaDescription: "How ZAVQERA compares with Process Street, Trello, Manifestly, ChatGPT, Claude and Gemini, with sources and the date each page was checked.",
});

export function toolComparisonPath(slug) {
  return slug ? `/compare/${slug}` : "/compare";
}

export function toolComparisonBySlug(slug) {
  return TOOL_COMPARISONS.find((item) => item.slug === slug);
}

/** A ZAVQERA cell: a key of ZAVQERA_FACTS, or the sentence itself. */
export function zavqeraCell(value) {
  return Object.prototype.hasOwnProperty.call(ZAVQERA_FACTS, value) && typeof ZAVQERA_FACTS[value] === "string" ? ZAVQERA_FACTS[value] : value;
}

/** "26 November 2026" from "2026-11-26". */
export function checkedDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${day} ${months[month - 1]} ${year}`;
}
