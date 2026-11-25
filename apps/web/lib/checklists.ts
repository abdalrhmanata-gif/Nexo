// Public, indexable checklists for the work small service businesses repeat:
// onboarding and offboarding people, onboarding clients and handing projects
// over, closing the month, launching websites, setting up vendors, inspecting
// rentals and reviewing who has access to what.
//
// Why these: they are what owners and operations leads of 2–20 person
// agencies, bookkeeping firms, property managers and IT services search for,
// and the people who search for them buy software for the job (see
// claude/ZAVQERA_PAYING_SEGMENT_CHECKLISTS_2026-11-25.md in the project).
//
// What makes them ZAVQERA's: every step says what proof to keep, and the
// button saves the checklist as a Mission where each step is ticked off with
// that proof. Nothing here claims a feature the product does not have: no
// assignees per step, no automatic recurrence, no approvals.
//
// English only, on purpose: the buyers searched for are in the US and the UK.
// Every visible word, the page's interface included, lives in this file, so
// the interface dictionary (lib/i18n.ts) is not involved.
//
// Rules for anything added (checked by test/checklists.test.mjs):
// - slugs are unique, lowercase and hyphenated, and every related slug exists;
// - the search title stays under 60 characters, the description under 160;
// - every step names the proof to keep;
// - a step that states a legal rule or a deadline cites an official source;
// - the saved plan has one action per step, in the same order.

export type ChecklistSource = { label: string; url: string };

export type ChecklistStep = {
  heading: string;
  detail: string;
  /** What to record on the step when it is done. */
  proof: string;
  source?: ChecklistSource;
};

export const CHECKLIST_GROUPS = ["people", "clients", "finance", "property"] as const;
export type ChecklistGroup = (typeof CHECKLIST_GROUPS)[number];

export type Checklist = {
  slug: string;
  group: ChecklistGroup;
  /** The page's H1. */
  title: string;
  /** Short label for breadcrumbs, cards and the saved Mission's basis line. */
  short: string;
  /** The search result title. Under 60 characters. */
  metaTitle: string;
  /** The search result description. Under 160 characters. */
  metaDescription: string;
  /** ISO date the content was last checked. */
  updated: string;
  audience: string;
  when: string;
  intro: string[];
  steps: ChecklistStep[];
  faqs: { question: string; answer: string }[];
  /** Success criteria of the saved Mission. Its actions are the step headings. */
  criteria: string[];
  /** The saved Mission's intent. */
  intent: string;
  related: string[];
};

export const CHECKLIST_CHROME = {
  indexTitle: "Checklists for the work you repeat",
  indexMetaTitle: "Free business checklists with proof for every step",
  indexMetaDescription: "Free checklists for onboarding, offboarding, month-end close, client handoffs and more. Save one in a click and keep proof on every step.",
  indexLead: "Onboarding a hire, closing the month, handing a project to a client: the same steps, every time, and someone will ask whether they were done. Each checklist below says what proof to keep at every step. Save one in a click, tick steps off with the proof attached, and keep the record.",
  indexNote: "Free to use. No card needed. Written for small teams that run these processes themselves.",
  checklistsLabel: "Checklists",
  groupHeading: { people: "People", clients: "Clients and projects", finance: "Finance and vendors", property: "Property" } satisfies Record<ChecklistGroup, string>,
  updated: "Checked",
  stepsCount: (count: number) => `${count} steps`,
  whoFor: "Who it is for",
  when: "When to run it",
  steps: "The checklist",
  proofLabel: "Keep as proof",
  sourceLabel: "Official source",
  faq: "Questions",
  related: "Related checklists",
  onThisPage: "On this page",
  open: "Open the checklist",
  ctaTitle: "Run this checklist with proof on every step",
  ctaBody: "Save it as a Mission in one click. Tick each step off with a note or a link as proof, see what is late, and keep the record when someone asks.",
  ctaButton: "Use this checklist",
  ctaEdit: "Edit the steps first",
  ctaFree: "Free plan, no card. Invite your team at no extra cost.",
  whyTitle: "Why keep proof on each step",
  why: [
    "A checklist that only gets ticked tells you someone clicked. A checklist with proof tells you what was done: the signed document, the reference number, the link to the file, the date.",
    "When a client, an auditor, an accountant or your future self asks whether a step was done, the answer is on the step instead of in someone's inbox.",
  ],
  repeatTitle: "Running it again next time",
  repeat: "On the Pro and Scale plans you can save a finished Mission as your own template, with your wording and your steps, and start the next run from it in one click.",
  disclaimer: "General guidance for small businesses, not legal, tax or accounting advice. Rules differ by country, state and industry: check the ones that apply to you.",
  allChecklists: "All checklists",
};

const UPDATED = "2026-11-25";

const USCIS_I9_SECTION_2: ChecklistSource = {
  label: "USCIS: Completing Section 2 of Form I-9",
  url: "https://www.uscis.gov/i-9-central/completing-form-i-9/completing-section-2-employer-review-and-attestation",
};
const ACF_NEW_HIRE: ChecklistSource = {
  label: "US Administration for Children and Families: New hire reporting",
  url: "https://acf.gov/css/outreach-material/new-hire-reporting-employers",
};
const GOV_UK_RIGHT_TO_WORK: ChecklistSource = {
  label: "GOV.UK: Checking a job applicant's right to work",
  url: "https://www.gov.uk/check-job-applicant-right-to-work",
};
const IRS_W4: ChecklistSource = { label: "IRS: About Form W-4", url: "https://www.irs.gov/forms-pubs/about-form-w-4" };
const IRS_W9: ChecklistSource = { label: "IRS: About Form W-9", url: "https://www.irs.gov/forms-pubs/about-form-w-9" };
const DOL_COBRA: ChecklistSource = { label: "US Department of Labor: COBRA continuation coverage", url: "https://www.dol.gov/general/topic/health-plans/cobra" };

export const checklists: Checklist[] = [
  {
    slug: "employee-onboarding-checklist",
    group: "people",
    title: "Employee onboarding checklist for small businesses",
    short: "Employee onboarding",
    metaTitle: "Employee Onboarding Checklist (Free, with Proof)",
    metaDescription: "A new hire checklist for small teams: paperwork, accounts, first day, first week and 30/60/90-day check-ins, with the proof to keep at every step.",
    updated: UPDATED,
    audience: "Owners and operations leads who hire a few people a year and want every new hire to get the same, complete start.",
    when: "From the day the offer is accepted until the 90-day check-in.",
    intro: [
      "Onboarding goes wrong in small companies for a simple reason: it happens rarely, so nobody remembers every step. A laptop arrives late, a form is missed, the new hire spends day one waiting for logins.",
      "This checklist runs from the accepted offer to the 90-day review. Each step says what to keep as proof, so you can show that the paperwork was done on time and the person had what they needed.",
    ],
    steps: [
      { heading: "Confirm the signed offer and start date", detail: "Get the signed offer letter or contract back and confirm the start date, role, manager and pay in writing.", proof: "The signed offer or contract, or a link to it in your document storage." },
      { heading: "Check the right to work before day one (UK)", detail: "In the UK, you must check that a job applicant is allowed to work for you before you employ them, online with their share code or with acceptable documents.", proof: "The date of the check and where the copy or online check result is stored.", source: GOV_UK_RIGHT_TO_WORK },
      { heading: "Complete Form I-9 (US)", detail: "The employee completes Section 1 no later than the first day of work for pay. You complete Section 2 within 3 business days of that first day.", proof: "The date Section 2 was completed and where the form is filed.", source: USCIS_I9_SECTION_2 },
      { heading: "Collect tax and payroll details", detail: "In the US, the employee gives you Form W-4 so you can withhold the correct federal income tax. Add bank details for payroll through your payroll provider, not by email.", proof: "Confirmation that payroll has the employee set up, with the first pay date.", source: IRS_W4 },
      { heading: "Report the new hire to the state (US)", detail: "Federal law requires employers to report new and rehired employees to the state within 20 days of hire; some states require it sooner.", proof: "The submission confirmation or reference number from the state portal.", source: ACF_NEW_HIRE },
      { heading: "Order equipment and create accounts", detail: "Laptop, phone, email, chat, the tools of the role and building access. Give each account only the access the role needs.", proof: "A list of the accounts created and the equipment's serial or asset numbers." },
      { heading: "Plan the first day and the first week", detail: "Who greets them, what they read, who they meet, and one small real task they can finish in the first week.", proof: "A link to the first-week plan shared with the new hire." },
      { heading: "Walk through policies and safety", detail: "The handbook, security rules, how to report a problem and any safety training the role needs.", proof: "The acknowledgement the employee signed, or the training completion record." },
      { heading: "Set goals for the first 90 days", detail: "Three to five outcomes the manager and the new hire agree on, written down.", proof: "A link to the agreed goals." },
      { heading: "Hold the 30, 60 and 90-day check-ins", detail: "Short conversations about what is working, what is missing and whether the goals still make sense.", proof: "The date of each check-in and a one-line summary." },
    ],
    faqs: [
      { question: "How long should onboarding take?", answer: "Paperwork is done in the first days, but a new hire usually needs a few months to be fully productive. This checklist runs to the 90-day check-in so the second and third months are not forgotten." },
      { question: "Do I need every step if I only hire contractors?", answer: "No. Form I-9, Form W-4 and new hire reporting apply to employees in the US. Contractors have their own paperwork, such as Form W-9. Remove the steps that do not apply before you save the checklist." },
      { question: "What counts as proof?", answer: "Anything that lets someone else confirm the step: a signed document, a reference number, a link to the file, a date. In ZAVQERA you add it as a note or a link when you mark the step done." },
    ],
    criteria: [
      "All required employment paperwork is complete and filed on time",
      "The new hire had equipment and access on their first day",
      "Goals for the first 90 days are agreed and reviewed at 30, 60 and 90 days",
    ],
    intent: "Give every new hire the same complete start, with the paperwork done on time and a record of each step.",
    related: ["employee-offboarding-checklist", "quarterly-access-review-checklist", "vendor-onboarding-checklist"],
  },
  {
    slug: "employee-offboarding-checklist",
    group: "people",
    title: "Employee offboarding checklist",
    short: "Employee offboarding",
    metaTitle: "Employee Offboarding Checklist: Access, Pay, Equipment",
    metaDescription: "An offboarding checklist for small teams: final pay, benefits, equipment, account access, handover and exit interview, with the proof to keep for each step.",
    updated: UPDATED,
    audience: "Small business owners and managers when someone resigns, is let go or finishes a fixed-term contract.",
    when: "From the day notice is given until the day after the last day.",
    intro: [
      "Offboarding is where small companies take real risks: a former employee who still has access to email or the bank, a laptop that never came back, a final paycheck that missed the legal deadline.",
      "This checklist covers the paperwork, the handover and, above all, access. For each step it says what to keep, so you can show later that access was removed and the person was paid correctly.",
    ],
    steps: [
      { heading: "Confirm the last day in writing", detail: "Get the resignation or the termination letter on file, with the last working day agreed.", proof: "The resignation email or termination letter." },
      { heading: "Check the final pay deadline", detail: "When final wages must be paid depends on where the employee works, and in some places it is the last day itself. Check the rule that applies and include unused paid leave if your policy or the law requires it.", proof: "The final payslip or payroll confirmation, with the date paid." },
      { heading: "Arrange benefits continuation", detail: "If your US health plan is covered by COBRA or a state continuation law, make sure the required election notice goes out, usually through your plan administrator.", proof: "The date the notice was sent and who sent it.", source: DOL_COBRA },
      { heading: "Plan the handover", detail: "What the person owns, who takes over each part, and the documents, passwords and client contacts that must be passed on.", proof: "A link to the handover document." },
      { heading: "Collect equipment and company property", detail: "Laptop, phone, keys, cards and anything bought by the company.", proof: "The asset numbers returned and the date." },
      { heading: "Remove access on the last day", detail: "Email, chat, file storage, the password manager, banking, payroll, social media accounts and any client systems. Change shared passwords the person knew.", proof: "A list of each system and the time access was removed." },
      { heading: "Forward email and update ownership", detail: "Forward or archive the mailbox, and transfer ownership of files, domains, ads accounts and subscriptions the person owned.", proof: "Where the mailbox now goes and the accounts transferred." },
      { heading: "Hold an exit conversation", detail: "Ask what worked, what did not and what would have kept them. Keep it short and note the themes.", proof: "A one-line summary and the date." },
      { heading: "Update records and tell the people who need to know", detail: "The team, affected clients and suppliers, the org chart and your website.", proof: "The date the update went out." },
    ],
    faqs: [
      { question: "When should access be removed?", answer: "On the last working day, or at the moment of a termination meeting. Leaving access on for a few days 'to be nice' is how most offboarding incidents happen." },
      { question: "Does this work for contractors too?", answer: "Yes, with fewer steps. Payroll, benefits and the exit conversation may not apply, but equipment, access and the handover always do." },
      { question: "How do I prove access was removed?", answer: "Record each system and the time access was turned off when you mark the step done. That list is what an auditor, a client or your insurer will ask for." },
    ],
    criteria: [
      "The person was paid correctly and on time",
      "All company equipment is back and every account's access is removed",
      "Their work and accounts are handed over to a named person",
    ],
    intent: "Close out a departure cleanly: correct final pay, every access removed on the last day, and the work handed over, with a record of each step.",
    related: ["quarterly-access-review-checklist", "employee-onboarding-checklist", "project-handoff-checklist"],
  },
  {
    slug: "client-onboarding-checklist",
    group: "clients",
    title: "Client onboarding checklist for agencies and freelancers",
    short: "Client onboarding",
    metaTitle: "Client Onboarding Checklist for Agencies and Freelancers",
    metaDescription: "A client onboarding checklist for agencies and freelancers: contract, payment, kickoff, access, goals and reporting, with proof of every step.",
    updated: UPDATED,
    audience: "Agencies, consultants and freelancers starting work with a new client.",
    when: "From the signed proposal to the end of the first month.",
    intro: [
      "The first weeks decide how a client relationship goes. Clients judge you on how organised the start feels, long before the results arrive.",
      "This checklist turns the start into a repeatable process: paperwork and payment first, then access, goals and a reporting rhythm. Every step says what to keep, so nothing depends on memory or an inbox search.",
    ],
    steps: [
      { heading: "Get the contract signed", detail: "Scope, deliverables, timeline, price, payment terms and what is out of scope, signed by both sides.", proof: "The signed contract or a link to it." },
      { heading: "Send the first invoice or deposit request", detail: "Agree before work starts whether you begin on signature or on payment.", proof: "The invoice number and the date it was paid." },
      { heading: "Send a welcome message with what happens next", detail: "Who their contact is, how and when you will communicate, and the next three dates.", proof: "A link to or copy of the welcome message." },
      { heading: "Collect the onboarding questionnaire", detail: "Goals, audience, competitors, brand guidelines, past results and what success looks like to them.", proof: "A link to the completed questionnaire." },
      { heading: "Get access to the accounts you need", detail: "Ask for your own login or delegated access to their website, analytics, ads or social accounts instead of their passwords.", proof: "A list of the systems you can access, and how." },
      { heading: "Hold the kickoff call", detail: "Agree the goals, the first deliverables, decision makers and how feedback is given.", proof: "The kickoff notes with the agreed goals." },
      { heading: "Record a baseline", detail: "Where things stand before you start: traffic, leads, sales, rankings or whatever the goals measure.", proof: "A link to the baseline numbers with their date." },
      { heading: "Share the project plan and dates", detail: "The deliverables in order, with a date for each and what you need from the client and when.", proof: "A link to the plan shared with the client." },
      { heading: "Agree the reporting rhythm", detail: "What you report, how often and in what format.", proof: "The first report, or the date it is due." },
    ],
    faqs: [
      { question: "Should I ask clients for their passwords?", answer: "Avoid it where you can. Most platforms let the owner add you as a user or partner, which keeps their account safe and lets them remove you cleanly at the end." },
      { question: "How long should client onboarding take?", answer: "For most service work, one to two weeks from signature to the first deliverable. The checklist runs to the end of the first month so the reporting rhythm is set." },
      { question: "Can the client see the checklist?", answer: "In ZAVQERA you can share a read-only link to a Mission's result. Proof notes stay private to your team." },
    ],
    criteria: [
      "The contract is signed and the first payment received before work begins",
      "Goals, baseline and the project plan are agreed with the client",
      "Access to every system needed is in place without sharing passwords",
    ],
    intent: "Start every client the same organised way: paperwork and payment first, then access, agreed goals and a reporting rhythm, with a record of each step.",
    related: ["project-handoff-checklist", "website-launch-checklist", "vendor-onboarding-checklist"],
  },
  {
    slug: "month-end-close-checklist",
    group: "finance",
    title: "Month-end close checklist for small businesses",
    short: "Month-end close",
    metaTitle: "Month-End Close Checklist for Small Businesses",
    metaDescription: "A month-end close checklist: reconcile bank and cards, review receivables and payables, accruals, payroll, then review and lock the month, with proof.",
    updated: UPDATED,
    audience: "Bookkeepers, accountants and owners who close the books for one business or many clients.",
    when: "Every month, in the first days after the month ends.",
    intro: [
      "A clean close is the same twelve-ish steps every month, done in order, with the evidence kept. Skipping one does not show until the year end, when it costs the most to fix.",
      "This checklist covers a typical small-business close on accrual or cash basis. Each step says what to keep as proof, such as the reconciliation report or the adjusting entry, so the file explains itself to a reviewer, a client or a tax preparer.",
    ],
    steps: [
      { heading: "Collect statements and documents", detail: "Bank and credit card statements, loan statements, payroll reports, and receipts and bills for the month.", proof: "Where the month's statements are stored." },
      { heading: "Reconcile every bank account", detail: "Match the ledger to the statement and explain every difference.", proof: "The reconciliation report for each account, with the ending balance." },
      { heading: "Reconcile credit cards and loans", detail: "Card statements, loan balances and the interest split.", proof: "The reconciliation report or the statement balance that ties out." },
      { heading: "Review accounts receivable", detail: "Check the aging report, follow up overdue invoices and record any bad debt your policy allows.", proof: "The aging report as of month end." },
      { heading: "Review accounts payable", detail: "Make sure every bill for the month is entered and nothing is paid twice.", proof: "The payables aging report as of month end." },
      { heading: "Record accruals and prepaid expenses", detail: "Expenses incurred but not billed, and the month's share of prepaid items such as insurance or annual software.", proof: "The adjusting journal entries with their references." },
      { heading: "Reconcile payroll", detail: "Payroll expense and liabilities in the ledger against the payroll provider's reports.", proof: "The payroll summary report that ties to the ledger." },
      { heading: "Record depreciation and other recurring entries", detail: "Fixed asset depreciation, amortisation and any standing monthly entries.", proof: "The journal entry references." },
      { heading: "Review the profit and loss and the balance sheet", detail: "Compare with last month and the budget. Investigate anything unusual before you report.", proof: "The reports reviewed, with a note on any variance explained." },
      { heading: "Lock the period", detail: "Close the month in your accounting software so nothing changes it by accident.", proof: "The date the period was locked." },
      { heading: "Send the month's report", detail: "To the owner, the client or management: the key numbers and what changed.", proof: "A link to the report and the date it was sent." },
    ],
    faqs: [
      { question: "How long should a month-end close take?", answer: "For a small business with tidy books, often a few days of work spread over the first week or two of the next month. The more steps are done in order with the evidence kept, the faster later months get." },
      { question: "I close the books for several clients. Can I run this once per client?", answer: "Yes. Save the checklist once for each client and month, so each close has its own record. On Pro and Scale you can save your version as your own template and start each new month from it." },
      { question: "Is this accounting advice?", answer: "No. It is a general checklist. Your accounting method, industry and country may need extra steps, such as sales tax or VAT returns or inventory counts." },
    ],
    criteria: [
      "Every bank, card and loan account is reconciled to its statement",
      "Accruals, payroll and recurring entries are recorded and tied out",
      "The month is reviewed, locked and reported",
    ],
    intent: "Close the month the same way every time, with each reconciliation and entry documented so the books explain themselves.",
    related: ["vendor-onboarding-checklist", "client-onboarding-checklist", "quarterly-access-review-checklist"],
  },
  {
    slug: "project-handoff-checklist",
    group: "clients",
    title: "Project handoff checklist: delivering work to a client",
    short: "Project handoff",
    metaTitle: "Project Handoff Checklist: Close Out Client Projects",
    metaDescription: "A project handoff and closeout checklist for agencies and freelancers: deliverables, sign-off, access, documentation, final invoice, with proof.",
    updated: UPDATED,
    audience: "Agencies, studios, consultants and freelancers finishing a project for a client.",
    when: "In the last week of a project and the days after delivery.",
    intro: [
      "Most disputes about a project start at the end: the client thought something was included, the files are hard to find, nobody has the passwords, or the final invoice waits for a sign-off that never comes.",
      "This checklist closes a project in a way you can prove: what was delivered, who accepted it and when, and what the client now owns.",
    ],
    steps: [
      { heading: "Check every deliverable against the contract", detail: "Go through the scope line by line and confirm each item is done.", proof: "A link to the deliverables list with each item checked." },
      { heading: "Deliver the final files", detail: "In the formats agreed, in one place the client controls.", proof: "A link to the delivered files and the date." },
      { heading: "Get written sign-off", detail: "Ask the client to confirm in writing that the work is accepted.", proof: "The sign-off email or signed acceptance." },
      { heading: "Transfer accounts and ownership", detail: "Domains, hosting, software licences, ad accounts and anything set up in your name for the client.", proof: "A list of each account and the date it was transferred." },
      { heading: "Remove your access or change shared passwords", detail: "Unless you are staying on for support, remove your logins and make sure the client changes any password you knew.", proof: "The systems your access was removed from." },
      { heading: "Hand over documentation", detail: "How things work, how to update them, and who to call if something breaks.", proof: "A link to the documentation." },
      { heading: "Hold a short training or walkthrough", detail: "Show the people who will run it day to day.", proof: "The date of the session and a link to the recording if there is one." },
      { heading: "Send the final invoice", detail: "Reference the sign-off in the invoice.", proof: "The invoice number and the date it was paid." },
      { heading: "Confirm what support continues", detail: "Any warranty period, maintenance plan or hourly support, in writing.", proof: "The support terms sent to the client." },
      { heading: "Ask for feedback and a referral", detail: "A short survey or call, and permission to use the project as a case study.", proof: "The feedback received and whether a case study was approved." },
    ],
    faqs: [
      { question: "What if the client never signs off?", answer: "Agree in the contract that work is accepted after a set number of days without written objection. Then record the date you delivered and the date acceptance applied." },
      { question: "Should I keep the client's files?", answer: "Keep what your contract and the law require, and delete the rest. Tell the client what you keep and for how long." },
      { question: "Can I use this for internal projects?", answer: "Yes. Replace the client with the team that will own the result, and keep the same sign-off and handover steps." },
    ],
    criteria: [
      "Every deliverable in the contract is delivered and accepted in writing",
      "Accounts, files and documentation are in the client's hands",
      "The final invoice is paid and the support terms are agreed",
    ],
    intent: "Close every project with proof of what was delivered and accepted, everything handed over, and the final invoice paid.",
    related: ["client-onboarding-checklist", "website-launch-checklist", "employee-offboarding-checklist"],
  },
  {
    slug: "website-launch-checklist",
    group: "clients",
    title: "Website launch checklist",
    short: "Website launch",
    metaTitle: "Website Launch Checklist: Before and After Go-Live",
    metaDescription: "A website launch checklist for agencies and small teams: content, forms, redirects, SEO, analytics, speed, backups and DNS, with proof of each check.",
    updated: UPDATED,
    audience: "Agencies, freelancers and in-house teams launching a new or rebuilt website.",
    when: "In the week before launch, on launch day and in the week after.",
    intro: [
      "A launch fails on small things: a staging setting left on that hides the site from Google, a contact form that sends to nobody, old pages that now return errors.",
      "This checklist covers the checks that matter for a small business site. Each step names the proof to keep, so you can show the client what was tested and when.",
    ],
    steps: [
      { heading: "Proofread every page", detail: "Spelling, prices, phone numbers, addresses, opening hours and legal names.", proof: "The date of the final read and who did it." },
      { heading: "Test every form and checkout", detail: "Submit each form and test purchase and check the message arrives where it should.", proof: "A screenshot or the test submission's reference." },
      { heading: "Set up redirects from old addresses", detail: "Every old page that mattered should redirect to its new address.", proof: "A link to the redirect map." },
      { heading: "Remove 'noindex' and check robots.txt", detail: "Staging sites are often hidden from search engines; make sure the live site is not.", proof: "A screenshot of the live robots.txt and a page's meta tags." },
      { heading: "Check titles, descriptions and the sitemap", detail: "Each page has its own title and description, and the sitemap lists the live pages.", proof: "The sitemap address and the date it was submitted to search consoles." },
      { heading: "Install analytics and check it records", detail: "Visit the site and confirm the visit appears.", proof: "A screenshot of the visit recorded." },
      { heading: "Check speed and mobile", detail: "Test the main pages on a phone and with a speed test.", proof: "The test results with their date." },
      { heading: "Check accessibility basics", detail: "Alt text on images, readable contrast, keyboard navigation and labelled form fields.", proof: "The result of an accessibility check." },
      { heading: "Publish privacy and cookie information", detail: "Make sure the privacy policy and any cookie notice match what the site actually collects.", proof: "Links to the published pages." },
      { heading: "Set up backups and uptime monitoring", detail: "Automatic backups you have restored at least once, and an alert if the site goes down.", proof: "The backup schedule and the monitoring service used." },
      { heading: "Switch DNS and check HTTPS", detail: "Point the domain, then check the site loads over HTTPS with and without 'www'.", proof: "The time DNS was switched and a screenshot of the secure site." },
      { heading: "Review the week after launch", detail: "Errors in search console, broken links, form submissions and analytics.", proof: "A short note of what was found and fixed." },
    ],
    faqs: [
      { question: "How long before launch should I start this checklist?", answer: "About a week before. Content, forms and redirects take the longest to fix if something is wrong." },
      { question: "Is a website launch checklist only for agencies?", answer: "No. Anyone launching a site benefits, but agencies get the most from keeping proof, because the client will ask what was tested." },
      { question: "What should I do after launch?", answer: "Watch errors, forms and analytics for at least a week. The last step of the checklist is there so that review actually happens." },
    ],
    criteria: [
      "Forms, redirects and checkout work on the live site",
      "The live site can be found by search engines and is measured by analytics",
      "Backups and monitoring are running and the first week was reviewed",
    ],
    intent: "Launch the website with every important check done and recorded, and nothing broken in the first week.",
    related: ["project-handoff-checklist", "client-onboarding-checklist", "quarterly-access-review-checklist"],
  },
  {
    slug: "vendor-onboarding-checklist",
    group: "finance",
    title: "Vendor onboarding checklist",
    short: "Vendor onboarding",
    metaTitle: "Vendor Onboarding Checklist for Small Businesses",
    metaDescription: "A vendor and supplier onboarding checklist: contract, tax forms, verified bank details, insurance, data protection and first payment, with proof.",
    updated: UPDATED,
    audience: "Owners, office managers and bookkeepers who set up new suppliers, contractors and software vendors.",
    when: "Before the first purchase order or the first payment to a new vendor.",
    intro: [
      "Paying a new vendor is where payment fraud starts: a fake invoice, or an email asking to change bank details. A short onboarding routine prevents most of it.",
      "This checklist sets up a vendor once, properly, and keeps the evidence: the contract, the tax form, how the bank details were verified and what data they can see.",
    ],
    steps: [
      { heading: "Agree the contract or terms", detail: "Price, payment terms, what is delivered, how to cancel and who owns the work.", proof: "The signed contract or accepted terms." },
      { heading: "Collect tax details", detail: "In the US, ask vendors you will pay for services for Form W-9, so you have the taxpayer identification number you need for information returns.", proof: "Where the W-9 or equivalent is stored.", source: IRS_W9 },
      { heading: "Verify bank details by calling back", detail: "Call the vendor on a number you already know, not one in the email, to confirm the account. Do the same for any later change.", proof: "The date of the call and who confirmed the details." },
      { heading: "Check insurance and licences where they matter", detail: "For contractors on site or regulated work, ask for current certificates.", proof: "The certificates and their expiry dates." },
      { heading: "Sign a data protection agreement if they handle personal data", detail: "If the vendor processes personal data for you, put the required terms in writing, such as a data processing agreement under the GDPR.", proof: "The signed agreement." },
      { heading: "Give only the access they need", detail: "Separate logins, no shared passwords, and only the systems the work requires.", proof: "A list of the access granted." },
      { heading: "Add the vendor to your accounting software", detail: "With the payment terms and the right expense category.", proof: "The vendor record in your accounting software." },
      { heading: "Approve the first invoice against the contract", detail: "Check the amount, the bank details and that the work was delivered before paying.", proof: "The invoice number and payment date." },
    ],
    faqs: [
      { question: "Why call to verify bank details?", answer: "Because email can be faked or hacked. A call to a number you already had is the simplest control against payment-redirection fraud." },
      { question: "Do I need a W-9 from every vendor?", answer: "In the US it is standard to request one from vendors you pay for services, and the IRS page explains what the form is for. Ask your accountant which vendors need one for your situation." },
      { question: "Does this apply to software subscriptions?", answer: "Partly. Contracts, data protection and access matter most for software; bank verification matters most for vendors you pay by transfer." },
    ],
    criteria: [
      "The contract and tax details are on file before the first payment",
      "Bank details were verified independently",
      "The vendor has only the access and data the work needs",
    ],
    intent: "Set up every new vendor the same safe way, with the contract, tax details and verified bank details on file before the first payment.",
    related: ["month-end-close-checklist", "client-onboarding-checklist", "quarterly-access-review-checklist"],
  },
  {
    slug: "move-in-move-out-inspection-checklist",
    group: "property",
    title: "Rental move-in and move-out inspection checklist",
    short: "Move-in and move-out inspection",
    metaTitle: "Move-In and Move-Out Inspection Checklist for Rentals",
    metaDescription: "A rental inspection checklist for landlords and property managers: photos, meter readings, keys, condition room by room and the deposit, with proof.",
    updated: UPDATED,
    audience: "Landlords and property managers handing a rental to a tenant or getting it back.",
    when: "On the day the tenant moves in, and again on the day they move out.",
    intro: [
      "Deposit disputes come down to evidence: what the property looked like on the first day and on the last. Without dated photos and a signed report, it is your word against the tenant's.",
      "This checklist makes both inspections the same, so the move-out can be compared with the move-in point by point.",
    ],
    steps: [
      { heading: "Book the inspection with the tenant", detail: "Agree a time when the tenant can attend, so the report is made together.", proof: "The confirmed date and time." },
      { heading: "Photograph every room", detail: "Walls, floors, windows, doors, appliances and fixtures, in good light, with the date recorded.", proof: "A link to the dated photo folder." },
      { heading: "Record the condition room by room", detail: "Note marks, damage and wear on a written report, matched to the photos.", proof: "A link to the completed report." },
      { heading: "Test appliances, heating and alarms", detail: "Oven, fridge, washing machine, heating, hot water, smoke and carbon monoxide alarms.", proof: "A note of what was tested and its condition." },
      { heading: "Read the meters", detail: "Electricity, gas and water, with a photo of each meter.", proof: "The readings and the meter photos." },
      { heading: "Count and hand over the keys", detail: "Every key, fob and remote, and the code of any lock that has one.", proof: "The number of keys handed over or returned." },
      { heading: "Sign the report together", detail: "Both sides sign or confirm the report in writing.", proof: "The signed report or the tenant's written confirmation." },
      { heading: "Handle the deposit as the rules require", detail: "Deposit protection, deductions and return deadlines differ by country and state. Check the rules that apply to the property.", proof: "The deposit receipt, protection certificate or return confirmation." },
    ],
    faqs: [
      { question: "What should a move-out inspection compare?", answer: "The same items as the move-in report, in the same order, with photos from the same angles. Normal wear and tear is usually treated differently from damage, so note which is which." },
      { question: "Do I need the tenant present?", answer: "It is best practice because it avoids disputes later. If they cannot attend, send them the report and photos promptly and ask for a written reply." },
      { question: "How long should I keep inspection records?", answer: "At least until the deposit is settled and any time limit for claims has passed. Check the rules where the property is." },
    ],
    criteria: [
      "The property's condition is recorded with dated photos at move-in and move-out",
      "Meter readings and keys are recorded and confirmed by the tenant",
      "The deposit is handled under the rules that apply to the property",
    ],
    intent: "Inspect the rental the same way at move-in and move-out, with dated photos and a signed report, so the deposit is settled on evidence.",
    related: ["vendor-onboarding-checklist", "month-end-close-checklist", "quarterly-access-review-checklist"],
  },
  {
    slug: "quarterly-access-review-checklist",
    group: "people",
    title: "Quarterly user access review checklist",
    short: "Access review",
    metaTitle: "User Access Review Checklist for Small Businesses",
    metaDescription: "A quarterly access review checklist: list every system, check each user and permission, remove what is not needed and record the review as proof.",
    updated: UPDATED,
    audience: "Owners, office managers and IT providers responsible for who can log in to what.",
    when: "Every quarter, and after any change in the team.",
    intro: [
      "Small companies collect access quietly: a former contractor still in the file storage, an intern who became an admin, a shared password nobody changed. Many security frameworks and customer security questionnaires ask for a periodic access review for exactly this reason.",
      "This checklist is a review you can finish in an afternoon and show afterwards: which systems were checked, what was removed and when.",
    ],
    steps: [
      { heading: "List every system the business uses", detail: "Email, file storage, finance, payroll, CRM, website, social media, domains and the password manager.", proof: "A link to the system list." },
      { heading: "Export the users of each system", detail: "Who has an account and what role they have.", proof: "The exported user lists with their date." },
      { heading: "Check each user against the current team", detail: "Remove anyone who has left, and accounts nobody can explain.", proof: "The accounts removed, by system." },
      { heading: "Check admin rights", detail: "Keep admin access to as few people as possible.", proof: "The admins kept in each system." },
      { heading: "Check that two-factor sign-in is on", detail: "For every account that supports it, starting with email, finance and domains.", proof: "The systems where two-factor is enforced." },
      { heading: "Change shared passwords", detail: "Any password that more than one person knew, or that a leaver knew.", proof: "The accounts whose passwords were changed." },
      { heading: "Review outside access", detail: "Contractors, agencies and vendors with logins or connected apps.", proof: "The outside access kept and removed." },
      { heading: "Record the review", detail: "Who did it, when, and what changed.", proof: "A short summary with the date." },
    ],
    faqs: [
      { question: "How often should access be reviewed?", answer: "Quarterly is common for small businesses, plus a check whenever someone joins, changes role or leaves." },
      { question: "Is this enough for SOC 2 or ISO 27001?", answer: "No single checklist makes you compliant. This review covers one control those frameworks ask about; follow your auditor's requirements for the rest." },
      { question: "What is the most important system to check?", answer: "Email. Whoever controls email can usually reset the password of everything else." },
    ],
    criteria: [
      "Every system's users are checked against the current team",
      "Leavers, unexplained accounts and unneeded admin rights are removed",
      "The review is recorded with its date and changes",
    ],
    intent: "Review who can access each business system every quarter, remove what is not needed, and keep a record of the review.",
    related: ["employee-offboarding-checklist", "employee-onboarding-checklist", "vendor-onboarding-checklist"],
  },
];

export function checklistBySlug(slug: string) {
  return checklists.find((checklist) => checklist.slug === slug) ?? null;
}

export function checklistPath(slug?: string) {
  return slug ? `/checklists/${slug}` : "/checklists";
}

/** The plan the "Use this checklist" button saves: one action per step. */
export function checklistMission(checklist: Checklist) {
  return {
    name: checklist.short,
    intent: checklist.intent,
    criteria: checklist.criteria,
    actions: checklist.steps.map((step) => step.heading),
  };
}

/** The plan as a prefilled new-mission form, for editing before saving. */
export function checklistMissionHref(checklist: Checklist) {
  const mission = checklistMission(checklist);
  const params = new URLSearchParams({
    name: mission.name,
    intent: mission.intent,
    criteria: mission.criteria.join("\n"),
    actions: mission.actions.join("\n"),
  });
  return `/app/missions/new?${params.toString()}`;
}
