// The comparison page: ZAVQERA next to ChatGPT, Claude and Gemini.
//
// Written to be found by people searching "ChatGPT vs ..." or "best AI for
// goal planning", and to stay fair enough that a reader who uses those
// assistants nods along. English only for now (owner's decision, 23 Nov 2026).
//
// Rules for anything added (checked by test/compare.test.mjs):
// - a statement about another product names a source, and the source is that
//   company's own help page;
// - nothing here claims ZAVQERA does something it does not do. Its AI drafts
//   only when asked, does not browse the web and never acts for the user.
// Their products change often, so `checked` is the date the sources were read.

export const COMPARE_PATH = "/compare/zavqera-vs-chatgpt-claude-gemini";

export type CompareSourceKey = "chatgptProjects" | "chatgptTasks" | "claudeProjects" | "claudeMemory" | "geminiScheduled";

export const COMPARE_SOURCES: Record<CompareSourceKey, { label: string; url: string }> = {
  chatgptProjects: { label: "OpenAI Help: Projects in ChatGPT", url: "https://help.openai.com/en/articles/10169521-projects-in-chatgpt" },
  chatgptTasks: { label: "OpenAI Help: Scheduled tasks in ChatGPT", url: "https://help.openai.com/en/articles/10291617-tasks-in-chatgpt" },
  claudeProjects: { label: "Claude Help Center: Projects", url: "https://support.claude.com/en/articles/9519177-projects" },
  claudeMemory: { label: "Claude Help Center: Chat search and memory", url: "https://support.claude.com/en/articles/11817273" },
  geminiScheduled: { label: "Gemini Apps Help: Schedule actions", url: "https://support.google.com/gemini/answer/16316416" },
};

export const compare = {
  checked: "2026-11-23",
  metaTitle: "ZAVQERA vs ChatGPT, Claude & Gemini for Goal Planning",
  metaDescription: "ChatGPT, Claude and Gemini are great for thinking and drafting. Here is where a goal tracker with evidence and a clear definition of done fits in.",
  eyebrow: "Comparison",
  title: "ZAVQERA vs ChatGPT, Claude and Gemini for goal planning",
  lead: [
    "Short answer: use ChatGPT, Claude or Gemini to think, research and draft. Use ZAVQERA when one goal has to be finished and you want to show that it was.",
    "The three assistants are excellent at conversation. ZAVQERA is narrower on purpose: every goal becomes a Mission with a written definition of done, steps with a status, a record of what you checked, and a result you accept only when that record is there.",
  ],
  tableTitle: "Side by side",
  tableCaption: "What you get when the goal is the thing you are tracking",
  columns: { feature: "What you need", assistants: "ChatGPT, Claude, Gemini", zavqera: "ZAVQERA" },
  rows: [
    {
      feature: "A first plan from your goal",
      assistants: "Yes. Ask in a chat and you get a plan back.",
      zavqera: "Yes, when you ask. It also points out where your goal is too vague to act on.",
    },
    {
      feature: "A written definition of \"done\"",
      assistants: "Only if you write it into the conversation yourself.",
      zavqera: "Part of every Mission: success criteria sit next to the goal.",
    },
    {
      feature: "Steps with a status you update",
      assistants: "As text in a reply or a document you keep editing.",
      zavqera: "Each step has its own status, and blockers stay visible.",
    },
    {
      feature: "A record of what you checked",
      assistants: "Not a built-in feature.",
      zavqera: "A verification you record against your success criteria before the result counts.",
    },
    {
      feature: "Accepting the result",
      assistants: "No such step. The chat ends when you stop asking.",
      zavqera: "You commit an outcome only after a verification is recorded.",
    },
    {
      feature: "Comparing business ideas",
      assistants: "Ask in a chat. The answer can change from one chat to the next.",
      zavqera: "Opportunity Intelligence scores ideas side by side and keeps what you know apart from what you assume.",
    },
    {
      feature: "Research, writing and code",
      assistants: "Their strength. Use them for it.",
      zavqera: "Not what it is for. Its AI does not browse the web or act for you.",
    },
    {
      feature: "Sharing a finished plan",
      assistants: "Share a conversation.",
      zavqera: "Share a link you can revoke; others can copy the plan into their own account.",
    },
  ],
  assistantsTitle: "What each assistant does well",
  assistantsLead: "All three can draft a solid plan. Each also has ways to keep work going over time:",
  assistants: [
    {
      name: "ChatGPT",
      points: [
        { text: "Projects group related chats, files and instructions, and remember the chats you have had inside a project.", source: "chatgptProjects" },
        { text: "Scheduled tasks run one-off or recurring check-ins, such as a daily brief.", source: "chatgptTasks" },
      ],
    },
    {
      name: "Claude",
      points: [
        { text: "Projects hold your documents and instructions, and are available on free accounts too.", source: "claudeProjects" },
        { text: "Each project has its own memory, kept apart from other projects.", source: "claudeMemory" },
      ],
    },
    {
      name: "Gemini",
      points: [
        { text: "Scheduled actions run a prompt daily, weekly or monthly, for example a morning summary.", source: "geminiScheduled" },
      ],
    },
  ],
  checkedNote: "Checked against each company's own help pages on 23 November 2026. These products change often; the linked pages are the authority.",
  whenTitle: "Which one to use",
  when: [
    { lead: "Use an assistant", text: "to brainstorm, research a market, write a pitch, or think a decision through out loud." },
    { lead: "Use ZAVQERA", text: "when a goal has a deadline or someone to answer to, such as a launch, a company registration or a first ten customers, and you need to know what is done, what is blocked and what is still a guess." },
    { lead: "Use both", text: "draft the plan in the assistant you already use, paste the steps into a Mission, and track it to a verified result." },
  ],
  faqTitle: "Questions",
  faqs: [
    {
      question: "Is ZAVQERA a replacement for ChatGPT, Claude or Gemini?",
      answer: "No. It does one job: carrying a goal from intent to a result you can prove. For open conversation, research and writing, a general assistant is the better tool.",
    },
    {
      question: "Does ZAVQERA's AI act on my behalf?",
      answer: "No. It drafts a plan only when you ask, it does not browse the web, and it never takes actions for you. You review every step before it counts.",
    },
    {
      question: "Can I use ZAVQERA with the assistant I already pay for?",
      answer: "Yes. Draft in any assistant, then paste the goal and steps into a new Mission. ZAVQERA keeps the record; the assistant stays your thinking partner.",
    },
    {
      question: "Is ZAVQERA free?",
      answer: "You can start free, with no card. Paid plans add more AI plans each month; the pricing page has the details.",
    },
  ],
  ctaTitle: "Try it on one real goal",
  ctaBody: "Write the outcome you want, get a first plan, and record what you checked before you call it done.",
  ctaPrimary: "Start free",
  ctaSecondary: "See a real Mission",
  sourcesTitle: "Sources",
  disclosure: "Written by ZAVQERA. ChatGPT, Claude and Gemini are trademarks of OpenAI, Anthropic and Google. ZAVQERA is not affiliated with any of them.",
};
