// /llms.txt: what ZAVQERA is, in plain Markdown for AI assistants and the
// crawlers that feed them (the llmstxt.org format: a title, a one-line
// summary, a few paragraphs, then sections of links).
//
// Built from the same data as the pages it points at, so it cannot drift:
// prices and AI drafts from the pricing data, features from the home page's
// structured data, and one line for every checklist, template, comparison and
// guide. Facts only, as everywhere else: what ZAVQERA does not do is said
// too, so an assistant does not promise it.

import { PLAN_LIMITS } from "./billing-plans.mjs";
import { FEATURES, FOUNDER, PLAN_PRICES_USD, PROFILES, SITE_DESCRIPTION, SITE_URL } from "./site-schema.mjs";

/** The public repository (renamed from Nexo on 26 Nov 2026). */
export const SOURCE_URL = "https://github.com/abdalrhmanata-gif/zavqera";

const PLAN_KEYS = Object.freeze({ Free: "free", Plus: "plus", Pro: "pro", Scale: "scale" });

/** "- [Title](url): note" with the note left out when there is none. */
function linkLine({ title, url, description }) {
  const absolute = /^[a-z]+:/.test(url) ? url : `${SITE_URL}${url}`;
  return description ? `- [${title}](${absolute}): ${description}` : `- [${title}](${absolute})`;
}

function section(title, links) {
  if (!links.length) return "";
  return `## ${title}\n\n${links.map(linkLine).join("\n")}\n`;
}

/** "Free $0 (2 AI drafts a month), Plus $19 (10 AI drafts a month), ..." */
export function pricingSentence() {
  return Object.entries(PLAN_PRICES_USD)
    .map(([name, price]) => `${name} $${price} (${PLAN_LIMITS[PLAN_KEYS[name]]} AI drafts a month)`)
    .join(", ");
}

/**
 * The whole file. Each list holds { title, url, description }; url is a path
 * on zavqera.com or a full https address.
 */
export function buildLlmsTxt({ checklists = [], templates = [], comparisons = [], guides = [], localized = [] } = {}) {
  const intro = [
    "# ZAVQERA",
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `ZAVQERA is a web app at ${SITE_URL}, run from Norway. A small team starts from a ready-made checklist, or writes a goal and asks the AI for a first draft of the steps. Every step can have an owner and a due date; when someone marks it done they can keep proof on it, a short note and a link, so anyone can check the work later. Late steps are shown clearly, and "Assigned to you" lists each person's own steps.`,
    "",
    "What it does:",
    ...FEATURES.map((feature) => `- ${feature}`),
    "",
    `Pricing, per month in US dollars: ${pricingSentence()}. Every plan, Free included, has unlimited checklists and plans, steps, owners, due dates, proof, the ready-made checklists and templates, share links and team invites. Paid plans add AI drafts, a calendar link for more plans (Free 1, Plus 3, Pro and Scale all) and, from Pro, your own templates. Each person's AI drafts come from their own plan, so teammates can join a workspace for free. No card is needed for the Free plan. Details: ${SITE_URL}/pricing`,
    "",
    "What it does not do: its AI drafts a plan only when asked, does not browse the web and never acts for the user. Proof on a step is a note and a link, not a file upload. It has no built-in workflow automations.",
    "",
    "Who it is for: small businesses, agencies, freelancers, office managers, landlords and property managers who repeat the same processes and need to see who does what, by when, and what proves it was done.",
    "",
  ].join("\n");

  const product = [
    { title: "Home", url: "/", description: SITE_DESCRIPTION },
    { title: "Pricing", url: "/pricing", description: "Free, Plus, Pro and Scale, with what each plan adds." },
    { title: "Try it without an account", url: "/try", description: "A step-by-step plan for a goal, free and without signing up." },
    { title: "All checklists", url: "/checklists", description: "Ready-made checklists for people, clients, finance and property." },
    { title: "Templates", url: "/templates", description: "Plans for common goals, ready to copy into your account." },
    {
      title: "ZAVQERA in ChatGPT, Claude and other AI assistants",
      url: "/ai",
      description: `Connect ZAVQERA to an AI assistant through the Model Context Protocol (remote server: ${SITE_URL}/mcp). Plans made in a conversation become checklists with steps, proof and dates, and the assistant can tell you what is next.`,
    },
  ];

  const company = [
    ...PROFILES.map((url) => ({ title: profileName(url), url })),
    { title: `Founder: ${FOUNDER.name}`, url: FOUNDER.profile },
    { title: "Source code", url: SOURCE_URL, description: "Published for transparency, so what the app stores, sends and decides can be checked against its code. All rights reserved." },
    { title: "Contact", url: "mailto:hello@zavqera.com", description: "hello@zavqera.com" },
  ];

  const optional = [
    { title: "Privacy", url: "/privacy" },
    { title: "Terms", url: "/terms" },
  ];

  return [
    intro,
    section("Product", product),
    section("Checklists", checklists),
    section("Templates", templates),
    section("Comparisons", comparisons),
    section("Guides", guides),
    section("In Arabic", localized),
    section("Company", company),
    section("Optional", optional),
  ].filter(Boolean).join("\n");
}

function profileName(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === "youtube.com") return "YouTube channel";
  if (host === "g2.com") return "Reviews on G2";
  if (host === "crunchbase.com") return "Company profile on Crunchbase";
  return host;
}
