// Public, indexable guides for people starting a business in the United
// States. They exist to be found in search: each answers one question people
// type into Google, cites the official source for every fact that could go
// stale, and ends with a button that turns the guide into the reader's own
// Mission.
//
// Written in English on purpose. The audience is American and the sources are
// federal agencies; a translated fee or eligibility rule that drifts from the
// English original is worse than no translation. The page files are listed in
// ENGLISH_ON_PURPOSE in test/i18n-bare-text.test.mjs for the same reason.
//
// Rules for anything added here (checked by test/guides.test.mjs):
// - every source is an official https://*.gov page;
// - a fee, deadline or eligibility rule appears only next to its source;
// - the mission prefill stays short enough to read as a first draft.

export type GuideSource = { label: string; url: string };

export type GuideStep = {
  heading: string;
  body: string[];
  source?: GuideSource;
};

export type Guide = {
  slug: string;
  /** The page's H1. */
  title: string;
  /** The search result title. Keep under about 60 characters. */
  metaTitle: string;
  /** The search result description. Keep under about 155 characters. */
  metaDescription: string;
  /** ISO date the facts were last checked against the sources. */
  updated: string;
  intro: string[];
  steps: GuideStep[];
  faqs: { question: string; answer: string }[];
  sources: GuideSource[];
  /** Pre-fills /app/missions/new, the same way a Mission template does. */
  mission: { name: string; intent: string; criteria: string[]; actions: string[] };
  related: string[];
};

const SBA_PLAN = { label: "SBA: Write your business plan", url: "https://www.sba.gov/business-guide/plan-your-business/write-your-business-plan" };
const SBA_REGISTER = { label: "SBA: Register your business", url: "https://www.sba.gov/business-guide/launch-your-business/register-your-business" };
const SBA_STRUCTURE = { label: "SBA: Choose a business structure", url: "https://www.sba.gov/business-guide/launch-your-business/choose-business-structure" };
const SBA_BANK = { label: "SBA: Open a business bank account", url: "https://www.sba.gov/business-guide/launch-your-business/open-business-bank-account" };
const SBA_LICENSES = { label: "SBA: Apply for licenses and permits", url: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits" };
const SBA_GUIDE = { label: "SBA: Business guide", url: "https://www.sba.gov/business-guide/10-steps-start-your-business" };
const IRS_EIN = { label: "IRS: Get an employer identification number", url: "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number" };

export const guides: Guide[] = [
  {
    slug: "how-to-start-a-business",
    title: "How to start a business in the US: a step-by-step checklist",
    metaTitle: "How to Start a Business: Step-by-Step Checklist (US)",
    metaDescription: "The steps to start a business in the US, in order: idea, plan, structure, registration, EIN, licenses and bank account, with official sources for each.",
    updated: "2026-11-18",
    intro: [
      "Starting a business is not one task. It is a dozen small ones that have to happen in roughly the right order, and most of the risk comes from doing one too early or forgetting one entirely.",
      "This checklist follows the order the U.S. Small Business Administration uses: plan, then launch. Each step links to the official page, because fees and rules differ by state and change over time.",
    ],
    steps: [
      {
        heading: "1. Check that someone will pay for it",
        body: [
          "Before you register anything, write down who the customer is, what problem you solve for them, and what they use today instead. Then talk to at least five people who fit that description.",
          "A registration can be done in an afternoon. Finding out nobody wants the product takes months if you start with the paperwork.",
        ],
      },
      {
        heading: "2. Write a short business plan",
        body: [
          "A plan does not have to be long. The SBA describes two formats: a traditional plan with sections such as market analysis and financial projections, and a one-page lean plan covering value proposition, customers, channels, costs and revenue.",
          "Lenders and investors usually expect the traditional format. If you are funding it yourself, the lean format is enough to start.",
        ],
        source: SBA_PLAN,
      },
      {
        heading: "3. Choose a business structure",
        body: [
          "The structure decides how you are taxed and whether your personal assets are protected. Common choices are a sole proprietorship, a partnership, a limited liability company (LLC) and a corporation.",
          "Many small founders choose an LLC because it separates business and personal liability with less paperwork than a corporation. A tax professional can tell you which fits your situation.",
        ],
        source: SBA_STRUCTURE,
      },
      {
        heading: "4. Pick a name and register the business",
        body: [
          "Check that the name is free in your state, then register with the state agency, usually the Secretary of State. If you will trade under a name other than your legal one, you may also need a DBA (\"doing business as\") registration.",
        ],
        source: SBA_REGISTER,
      },
      {
        heading: "5. Get an EIN from the IRS",
        body: [
          "An employer identification number is the business's federal tax ID. You need one to hire, to open most business bank accounts, and for most entities other than a single-owner sole proprietorship.",
          "The IRS issues it free of charge. Sites that charge for an EIN are not the IRS.",
        ],
        source: IRS_EIN,
      },
      {
        heading: "6. Apply for licenses and permits",
        body: [
          "Requirements depend on what you do and where. Check federal, state and local rules; city and county permits are the ones people most often miss.",
        ],
        source: SBA_LICENSES,
      },
      {
        heading: "7. Open a business bank account",
        body: [
          "Keep business money separate from personal money from day one. It makes taxes simpler and, for an LLC or corporation, helps keep the liability protection meaningful.",
        ],
        source: SBA_BANK,
      },
      {
        heading: "8. Keep a record of what you did",
        body: [
          "Save every confirmation: the state filing, the EIN letter, license numbers, account details. You will be asked for them again by banks, payment processors and accountants.",
        ],
      },
    ],
    faqs: [
      {
        question: "What is the first step to starting a business?",
        answer: "Confirm that people will pay for what you plan to sell. Registration and paperwork come after that, because they are quick to do and costly to undo.",
      },
      {
        question: "Do I need an LLC to start a business?",
        answer: "No. A sole proprietorship needs no state formation filing. An LLC is a common choice when you want to separate personal and business liability. Compare the options on the SBA's business structure page.",
      },
      {
        question: "How much does it cost to start a business?",
        answer: "Registration fees are set by each state, and licenses depend on your industry and location. The SBA's registration page gives the general range; your state's Secretary of State lists the exact fees.",
      },
    ],
    sources: [SBA_GUIDE, SBA_PLAN, SBA_STRUCTURE, SBA_REGISTER, IRS_EIN, SBA_LICENSES, SBA_BANK],
    mission: {
      name: "Start my business",
      intent: "Go from idea to a registered business that can take its first payment.",
      criteria: [
        "Five potential customers have confirmed the problem",
        "The business is registered with the state",
        "EIN received from the IRS",
        "Business bank account is open",
      ],
      actions: [
        "Talk to five potential customers",
        "Write a one-page plan",
        "Choose a business structure",
        "Register the business with the state",
        "Get an EIN from the IRS",
        "Check licenses and permits",
        "Open a business bank account",
      ],
    },
    related: ["how-to-start-an-llc", "how-to-get-an-ein", "how-to-write-a-business-plan"],
  },
  {
    slug: "how-to-start-an-llc",
    title: "How to start an LLC: a step-by-step guide",
    metaTitle: "How to Start an LLC: Step-by-Step Guide (2026)",
    metaDescription: "Form an LLC in your state: choose a name, appoint a registered agent, file articles of organization, write an operating agreement and get an EIN.",
    updated: "2026-11-18",
    intro: [
      "A limited liability company (LLC) is formed by filing with a state, not with the federal government. The steps are similar everywhere; the forms, fees and processing times are set by each state.",
      "Follow the steps below in order, and use your state's Secretary of State website for the exact form and fee.",
    ],
    steps: [
      {
        heading: "1. Choose the state to form in",
        body: [
          "Most small businesses form in the state where they operate. If you form elsewhere, you will usually still have to register in your home state as a \"foreign\" LLC, which means a second set of filings and annual fees.",
        ],
        source: SBA_REGISTER,
      },
      {
        heading: "2. Pick an available name",
        body: [
          "Search your state's business name database. Most states will not accept a name already registered by someone else, and many require the name to end with \"LLC\" or \"Limited Liability Company\".",
        ],
        source: SBA_REGISTER,
      },
      {
        heading: "3. Appoint a registered agent",
        body: [
          "A registered agent is the person or company that receives legal papers for the LLC in that state. You need one before you file. You can act as your own agent if you have a physical address in the state, or use a registered agent service.",
        ],
        source: SBA_REGISTER,
      },
      {
        heading: "4. File the articles of organization",
        body: [
          "This is the filing that creates the LLC. It usually lists the company name, address, members and registered agent. Many states accept it online; some still require mail or in-person filing.",
          "Fees vary by state. The SBA notes that total registration costs are usually under $300.",
        ],
        source: SBA_REGISTER,
      },
      {
        heading: "5. Write an operating agreement",
        body: [
          "The operating agreement sets out who owns what, how decisions are made, and what happens if a member leaves. Not every state requires one, but it is widely recommended, even for a single-member LLC.",
        ],
        source: SBA_REGISTER,
      },
      {
        heading: "6. Get an EIN",
        body: [
          "Once the state has approved the LLC, apply for an employer identification number directly with the IRS. It is free and, if you are eligible to apply online, issued immediately.",
        ],
        source: IRS_EIN,
      },
      {
        heading: "7. Open a bank account and check local permits",
        body: [
          "Use the approved articles and your EIN to open a business bank account. Then check whether your city or county requires a business license for what you do.",
        ],
        source: SBA_BANK,
      },
      {
        heading: "8. Put the annual filing in your calendar",
        body: [
          "Most states require an annual or biennial report and fee to keep the LLC in good standing. Missing it can lead to the LLC being dissolved. Your Secretary of State lists the due date.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I form an LLC myself without a lawyer?",
        answer: "Yes. The state filing is designed to be done by the owner. A lawyer is worth it when there are several members, outside investors, or unusual ownership terms.",
      },
      {
        question: "How long does it take to form an LLC?",
        answer: "It depends on the state and how you file. Online filings are often processed faster than mail. Your Secretary of State publishes current processing times.",
      },
      {
        question: "Do I need a separate EIN for an LLC?",
        answer: "An LLC with employees, or with more than one member, needs an EIN. A single-member LLC without employees may not, but most banks ask for one to open a business account.",
      },
    ],
    sources: [SBA_REGISTER, SBA_STRUCTURE, IRS_EIN, SBA_BANK],
    mission: {
      name: "Form my LLC",
      intent: "Have an LLC approved by the state, with an EIN and a bank account in its name.",
      criteria: [
        "Articles of organization approved by the state",
        "Operating agreement signed",
        "EIN received from the IRS",
        "Business bank account open",
      ],
      actions: [
        "Check the name is available in my state",
        "Choose a registered agent",
        "File the articles of organization",
        "Write and sign the operating agreement",
        "Apply for an EIN with the IRS",
        "Open a business bank account",
        "Add the annual report date to my calendar",
      ],
    },
    related: ["how-to-get-an-ein", "how-to-open-a-business-bank-account", "how-to-start-a-business"],
  },
  {
    slug: "how-to-get-an-ein",
    title: "How to get an EIN number for free, directly from the IRS",
    metaTitle: "How to Get an EIN Number (Free, Directly From the IRS)",
    metaDescription: "Apply for an EIN online with the IRS for free: who can apply, what you need, the online hours, and what to do if you can't use the online form.",
    updated: "2026-11-18",
    intro: [
      "An employer identification number (EIN) is a nine-digit federal tax ID for a business. You need one to hire employees, to file most business tax returns, and to open most business bank accounts.",
      "The IRS issues EINs free of charge. Many websites that rank above the IRS charge a fee to submit the same form on your behalf.",
    ],
    steps: [
      {
        heading: "1. Form the business first",
        body: [
          "If you are creating an LLC or corporation, wait until the state has approved it. The EIN application asks for the legal name and structure, and they should match the state record.",
        ],
      },
      {
        heading: "2. Check you can use the online application",
        body: [
          "The online form is for businesses formed in the U.S. or a U.S. territory with their principal place of business there. The person applying must be the responsible party (the person who controls the business) or their authorized representative, and needs the responsible party's SSN or ITIN.",
        ],
        source: IRS_EIN,
      },
      {
        heading: "3. Have your details ready",
        body: [
          "You will need the legal name and address, the entity type, the reason for applying, the start date, the responsible party's name and SSN or ITIN, and an estimate of employees in the next year.",
          "The online session cannot be saved and times out after 15 minutes of inactivity, so gather everything before you start.",
        ],
        source: IRS_EIN,
      },
      {
        heading: "4. Apply during the online hours",
        body: [
          "The IRS online application is only open at certain hours, listed on the IRS page. If approved, the EIN is issued at the end of the session.",
        ],
        source: IRS_EIN,
      },
      {
        heading: "5. Save the confirmation letter",
        body: [
          "Download or print the confirmation letter at the end of the session. Banks and payment processors often ask for it, and it is the simplest proof of the number.",
        ],
        source: IRS_EIN,
      },
      {
        heading: "6. If you can't apply online",
        body: [
          "Businesses with a principal place of business outside the U.S., and applicants without an SSN or ITIN, apply by phone, fax or mail instead. The IRS page lists each method.",
        ],
        source: IRS_EIN,
      },
    ],
    faqs: [
      {
        question: "How much does an EIN cost?",
        answer: "Nothing. The IRS does not charge for an EIN. A site that asks for payment is a private service, not the IRS.",
      },
      {
        question: "How long does it take to get an EIN?",
        answer: "Online applications that are approved receive the number at the end of the session. Fax and mail applications take longer; the IRS page gives current times.",
      },
      {
        question: "Can a non-US resident get an EIN?",
        answer: "Yes, but not through the online form. Applicants whose business is based outside the U.S. apply by phone, fax or mail.",
      },
      {
        question: "Can I get more than one EIN a day?",
        answer: "No. The IRS limits EINs to one per responsible party per day.",
      },
    ],
    sources: [IRS_EIN],
    mission: {
      name: "Get an EIN for my business",
      intent: "Receive an EIN from the IRS and keep the confirmation letter.",
      criteria: ["EIN issued by the IRS", "Confirmation letter saved"],
      actions: [
        "Confirm the business is formed with the state",
        "Collect the details the application asks for",
        "Apply on the IRS website during online hours",
        "Save the confirmation letter",
      ],
    },
    related: ["how-to-start-an-llc", "how-to-open-a-business-bank-account", "how-to-start-a-business"],
  },
  {
    slug: "how-to-write-a-business-plan",
    title: "How to write a business plan: sections and a simple checklist",
    metaTitle: "How to Write a Business Plan: Sections & Checklist",
    metaDescription: "What goes in a business plan, section by section, the one-page lean alternative, and how to choose between them. Based on the SBA's guidance.",
    updated: "2026-11-18",
    intro: [
      "A business plan is a written answer to three questions: who will pay, why they will pay you, and how the numbers work. Its length should match who is going to read it.",
      "The SBA describes two formats. Use the traditional plan if you are asking a lender or investor for money; use the lean plan if you are funding the business yourself and want to start quickly.",
    ],
    steps: [
      {
        heading: "1. Decide who the plan is for",
        body: [
          "A bank wants to see that the loan will be repaid. An investor wants to see how big the business can get. You want a plan you will actually check against. Write for one of them.",
        ],
      },
      {
        heading: "2. Executive summary",
        body: [
          "What the company does, who it serves, and why it will succeed, in a few paragraphs. Write it last, once the other sections are done.",
        ],
        source: SBA_PLAN,
      },
      {
        heading: "3. Company description and market analysis",
        body: [
          "Describe the problem you solve and the customers who have it. Then show what you know about the market: how many such customers there are, what they use today, and who the competitors are.",
        ],
        source: SBA_PLAN,
      },
      {
        heading: "4. Organization, products and marketing",
        body: [
          "Who runs the business and how it is structured; what you sell and how it is priced; and how customers will find out about it and buy.",
        ],
        source: SBA_PLAN,
      },
      {
        heading: "5. Funding request and financial projections",
        body: [
          "If you are asking for money, say how much, over what period and what it is for. Then show projected income, costs and cash flow. Be explicit about the assumptions; readers check those first.",
        ],
        source: SBA_PLAN,
      },
      {
        heading: "6. Or use the one-page lean format",
        body: [
          "The lean plan lists key partnerships, key activities, key resources, value proposition, customer relationships, customer segments, channels, cost structure and revenue streams, a line or two each.",
        ],
        source: SBA_PLAN,
      },
      {
        heading: "7. Turn the plan into a list of things to test",
        body: [
          "Every plan rests on a few guesses: that customers have the problem, that they will pay your price, that a channel will reach them. Write each one down, then mark it as tested or not yet tested. That list is more useful than the plan's page count.",
        ],
      },
    ],
    faqs: [
      {
        question: "How long should a business plan be?",
        answer: "As long as its reader needs. A lean plan fits on one page; a traditional plan for a lender or investor is usually several pages with financial projections.",
      },
      {
        question: "Do I need a business plan to start a business?",
        answer: "It is not a legal requirement. Lenders and investors usually ask for one, and writing even a short plan forces you to check your assumptions before you spend money.",
      },
      {
        question: "What are the main sections of a business plan?",
        answer: "The SBA lists executive summary, company description, market analysis, organization and management, service or product line, marketing and sales, funding request, and financial projections.",
      },
    ],
    sources: [SBA_PLAN],
    mission: {
      name: "Write my business plan",
      intent: "A business plan I can show to a lender, investor or partner, with every key assumption marked tested or untested.",
      criteria: [
        "Every section has a first draft",
        "Key assumptions are listed and marked tested or untested",
        "One person outside the business has read it",
      ],
      actions: [
        "Decide who the plan is for",
        "Draft the market analysis",
        "Draft products, pricing and marketing",
        "Build the financial projections",
        "List the assumptions and test the riskiest one",
        "Write the executive summary last",
      ],
    },
    related: ["how-to-start-a-business", "how-to-start-an-llc"],
  },
  {
    slug: "how-to-open-a-business-bank-account",
    title: "How to open a business bank account: documents you need",
    metaTitle: "How to Open a Business Bank Account: Documents Needed",
    metaDescription: "The documents banks usually ask for to open a business bank account (EIN, formation papers, ownership agreements, license) and how to prepare them.",
    updated: "2026-11-18",
    intro: [
      "A business bank account keeps business money apart from personal money. That makes bookkeeping and taxes simpler, and for an LLC or corporation it helps show the business is a separate entity.",
      "Banks set their own requirements, but most ask for the same handful of documents. Gather them first and the application is usually quick.",
    ],
    steps: [
      {
        heading: "1. Form the business and get an EIN",
        body: [
          "Most banks want to see that the business exists before they open an account in its name. For an LLC or corporation that means the state has approved it and you have an EIN. A sole proprietor can often use their Social Security number instead.",
        ],
        source: SBA_BANK,
      },
      {
        heading: "2. Gather the documents",
        body: [
          "According to the SBA, banks typically ask for: the EIN (or SSN for a sole proprietorship), the business formation documents, ownership agreements, and a business license. Some banks ask for more, such as identification for every owner.",
        ],
        source: SBA_BANK,
      },
      {
        heading: "3. Choose the account types you need",
        body: [
          "Most businesses start with a checking account. Others to consider are a savings account, a business credit card, and a merchant services account, which lets you accept card payments.",
        ],
        source: SBA_BANK,
      },
      {
        heading: "4. Compare banks on what you will actually use",
        body: [
          "Look at monthly fees and how to avoid them, transaction limits, cash deposits if you handle cash, integrations with your accounting or payment tools, and whether you can open the account online.",
        ],
      },
      {
        heading: "5. Apply and fund the account",
        body: [
          "Apply online or in a branch with the documents above. Many banks ask for an opening deposit; check the amount before you apply.",
        ],
      },
      {
        heading: "6. Use it for every business transaction",
        body: [
          "Pay business costs and receive business income only through this account. Mixing the two again later undoes most of the benefit.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I open a business bank account without an EIN?",
        answer: "A sole proprietor can often use their Social Security number. An LLC or corporation will usually need an EIN.",
      },
      {
        question: "Do I need a business license to open a business bank account?",
        answer: "Some banks ask for one, if your business needs a license. Check with the bank before you apply.",
      },
      {
        question: "Can I open a business bank account online?",
        answer: "Many banks offer online applications. Some will still ask you to verify your identity in a branch.",
      },
    ],
    sources: [SBA_BANK, IRS_EIN],
    mission: {
      name: "Open a business bank account",
      intent: "A business account open in the company's name, used for all business money.",
      criteria: ["Account approved and funded", "First business payment received in the account"],
      actions: [
        "Get the formation documents and EIN letter together",
        "Ask two or three banks what they require",
        "Compare fees and features",
        "Apply and make the opening deposit",
        "Move business payments to the new account",
      ],
    },
    related: ["how-to-get-an-ein", "how-to-start-an-llc", "how-to-start-a-business"],
  },
];

export function guideBySlug(slug: string) {
  return guides.find((guide) => guide.slug === slug) ?? null;
}

/** Same query shape as a Mission template's "Use this template" link. */
export function guideMissionHref(guide: Guide) {
  const params = new URLSearchParams({
    name: guide.mission.name,
    intent: guide.mission.intent,
    criteria: guide.mission.criteria.join("\n"),
    actions: guide.mission.actions.join("\n"),
  });
  return `/app/missions/new?${params.toString()}`;
}

export const SITE_URL = "https://zavqera.com";
