// The goal box: a visitor writes what they want to get done and sees a plan
// at once, before any account exists.
//
// Nothing here calls a model or the network. A goal is matched, by keyword,
// against what the product already holds: the guides (with their official
// sources), the mission templates, and the domains the planner knows. The
// most specific match wins: a guide for the country named beats a template,
// a template beats the planner's generic structure. Every word list below is
// in all six languages the product ships in, and test/goal-plan.test.mjs
// checks that each example on the page lands where it should in each one.
//
// What comes back is a reference (which guide, template or plan kind), not
// text: the caller turns it into the reader's language, and the same goal
// always gives the same plan, so a saved plan can be rebuilt on the server
// from the goal alone instead of trusting steps sent by a browser.

import { matchStrength, needsLicence, planScoreFor, suggestPlanFor } from "./mission-planner.mjs";

/** Longest goal accepted: a sentence, not an essay. */
export const GOAL_MAX_LENGTH = 160;
/** Shortest goal worth matching. */
export const GOAL_MIN_LENGTH = 4;

/**
 * Examples shown under the box, as English dictionary keys. Each one must
 * match `expect` in every language (checked by the tests), so a reader who
 * taps one never gets a plan for something else.
 */
export const GOAL_EXAMPLES = [
  { goal: "Close the month's books", expect: { source: "checklist", id: "month-end-close-checklist" } },
  { goal: "Open a small café", expect: { source: "planner", id: "venture" } },
  { goal: "Find a new job", expect: { source: "template", id: "find-a-job" } },
  { goal: "Start an LLC in the US", expect: { source: "guide", id: "how-to-start-an-llc" } },
  { goal: "Organise our wedding", expect: { source: "template", id: "organise-an-event" } },
];

const GERMANY = [
  "germany", "deutschland", "ألمانيا", "المانيا", "لألمانيا", "almanya", "allemagne", "alemania", "tyskland",
  "berlin", "munich", "münchen", "muenchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart",
  "düsseldorf", "leipzig", "dresden", "hannover", "nuremberg", "nürnberg", "bremen",
  "برلين", "ميونخ", "ميونيخ", "هامبورغ", "هامبورج", "فرانكفورت", "كولونيا", "شتوتغارت",
];

const UNITED_KINGDOM = [
  "uk", "united kingdom", "britain", "great britain", "england", "scotland", "wales", "london", "manchester",
  "birmingham", "edinburgh", "glasgow", "liverpool", "leeds", "bristol", "بريطانيا", "لبريطانيا", "المملكة المتحدة",
  "إنجلترا", "انجلترا", "إنكلترا", "اسكتلندا", "لندن", "مانشستر", "برمنغهام", "reino unido", "gran bretaña", "inglaterra",
  "londres", "escocia", "royaume uni", "grande bretagne", "angleterre", "écosse", "großbritannien", "grossbritannien",
  "vereinigtes königreich", "vereinigte königreich", "schottland", "storbritannia", "skottland",
];

/** Moving, living or working somewhere: what turns a country into a relocation. */
const RELOCATE = [
  "move", "moving", "moved", "move to", "relocate", "relocating", "relocation", "emigrate", "immigrate",
  "settle", "settling", "live in", "living in", "life in", "work in", "working in", "job in", "jobs in",
  "expat", "residence permit", "residence", "blue card", "register my address", "new country", "first month",
  "flytte", "flytter", "flyttet", "bo i", "bosette", "jobbe i", "jobb i", "oppholdstillatelse",
  "انتقال", "انتقل", "أنتقل", "انتقلت", "الهجرة", "هجرة", "أهاجر", "اهاجر", "هاجرت", "إقامة", "اقامة",
  "العيش", "أعيش", "اعيش", "السكن", "الاستقرار", "استقرار", "أستقر", "استقر", "العمل في", "عمل في",
  "وظيفة في", "لم الشمل",
  "mudarse", "mudarme", "mudanza", "emigrar", "vivir en", "trabajar en", "instalarme", "instalarse", "residencia",
  // "s'installer" is two tokens to the matcher, so the verb itself is listed.
  "déménager", "demenager", "installer", "vivre en", "vivre au", "travailler en", "travailler au", "expatriation",
  "titre de séjour",
  "umziehen", "umzug", "auswandern", "auswanderung", "leben in", "arbeiten in", "wohnen in", "ziehen nach",
  "anmeldung", "aufenthaltstitel", "einwanderung",
];

const UNITED_STATES = [
  "usa", "united states", "america", "american", "amerika", "أمريكا", "امريكا", "أميركا", "اميركا",
  "الولايات المتحدة", "estados unidos", "eeuu", "états unis", "etats unis", "vereinigte staaten",
  "delaware", "wyoming", "texas", "florida", "california", "new york", "nevada",
];

const LLC = ["llc", "limited liability company", "ذات مسؤولية محدودة", "ذات المسؤولية المحدودة"];

const EIN = [
  "employer identification number", "employer id number", "federal tax id",
  "رقم تعريف صاحب العمل", "número de identificación del empleador", "numéro d'identification d'employeur",
];

const BUSINESS_PLAN = [
  "business plan", "businessplan", "خطة عمل", "خطة العمل", "خطة أعمال", "خطة الأعمال", "plan de negocios",
  "plan de negocio", "plan d'affaires", "geschäftsplan", "forretningsplan",
];

const BUSINESS_BANK_ACCOUNT = [
  "business bank account", "business account", "bank account for my business", "bank account for my company",
  "bank account for my llc", "حساب بنكي تجاري", "حساب بنكي للشركة", "حساب مصرفي تجاري", "حساب بنكي لشركتي",
  "cuenta bancaria de empresa", "cuenta bancaria empresarial", "cuenta de empresa", "compte bancaire professionnel",
  "compte professionnel", "geschäftskonto", "firmenkonto", "bedriftskonto",
];

const BUSINESS = [
  "business", "company", "startup", "start up", "small business", "incorporate", "شركة", "مشروع تجاري",
  "تجارة", "empresa", "negocio", "emprendimiento", "entreprise", "société", "unternehmen", "firma",
  "gründung", "bedrift", "selskap", "foretak",
];

const START_VERBS = [
  "start", "starting", "open", "opening", "launch", "set up", "found", "create", "register", "begin",
  "ابدأ", "أبدأ", "ابدا", "بدء", "افتتاح", "افتح", "أفتح", "فتح", "انشاء", "إنشاء", "تأسيس", "أؤسس",
  "abrir", "montar", "crear", "empezar", "iniciar", "ouvrir", "créer", "lancer", "monter",
  "eröffnen", "gründen", "starten", "aufbauen", "starte", "åpne", "etablere", "opprette",
];

const JOB = [
  "job", "jobs", "new job", "find a job", "find work", "career", "cv", "resume", "résumé", "employment",
  "job search", "job hunt", "وظيفة", "وظيفه", "وظائف", "شغل", "عمل جديد", "أبحث عن عمل", "ابحث عن عمل",
  "البحث عن عمل", "إيجاد عمل", "ايجاد عمل", "سيرة ذاتية", "السيرة الذاتية", "مقابلة عمل",
  "empleo", "trabajo", "buscar trabajo", "currículum", "emploi", "travail", "chercher un emploi",
  "trouver un emploi", "stelle", "arbeitsplatz", "jobsuche", "bewerbung", "lebenslauf", "neue stelle",
  "jobb", "ny jobb", "stilling", "arbeid", "søke jobb", "jobbsøknad",
];

const EVENT = [
  "event", "wedding", "party", "birthday", "conference", "meetup", "celebration", "reunion", "ceremony",
  "gala", "festival", "حفل", "حفلة", "حفلات", "زفاف", "عرس", "خطوبة", "مؤتمر", "فعالية", "مناسبة",
  "عيد ميلاد", "تخرج", "boda", "fiesta", "evento", "conferencia", "cumpleaños", "celebración",
  "mariage", "fête", "événement", "evenement", "conférence", "anniversaire", "hochzeit", "feier",
  "veranstaltung", "konferenz", "geburtstag", "jubiläum", "bryllup", "fest", "bursdag", "konferanse",
  "arrangement", "konfirmasjon",
];

const SETTLE = [
  "settle", "settle in", "settling", "just moved", "newly arrived", "new country", "new in", "arrived",
  "استقر", "الاستقرار", "أستقر", "استقرار", "وصلت", "بلد جديد", "instalarme", "instalarse",
  "recién llegado", "nuevo país", "installer", "nouveau pays", "einleben", "ankommen",
  "angekommen", "neues land", "bosette", "nytt land", "nyankommet",
];

const GROWTH = [
  "grow my business", "grow", "growth", "more customers", "more clients", "competitors", "competition",
  "market research", "opportunities", "expand", "increase sales", "نمو", "تنمية", "توسيع", "توسع",
  "عملاء أكثر", "زيادة المبيعات", "المبيعات", "المنافسين", "منافسين", "دراسة السوق", "فرص",
  "crecer", "crecimiento", "más clientes", "competidores", "croissance", "développer", "plus de clients",
  "concurrents", "wachstum", "wachsen", "mehr kunden", "wettbewerber", "konkurrenz", "umsatz",
  "vekst", "flere kunder", "konkurrenter", "markedsundersøkelse",
];

const DECISION = [
  "decide", "decision", "choose", "choosing", "compare", "comparison", "should i", "which is better",
  "or not", "أقرر", "قرار", "اختيار", "أختار", "المقارنة", "مقارنة", "هل يجب", "decidir", "decisión",
  "elegir", "comparar", "décider", "décision", "choisir", "comparer", "entscheiden", "entscheidung",
  "wählen", "vergleichen", "bestemme", "beslutning", "velge", "sammenligne",
];

const WORKFLOW = [
  "workflow", "routine", "weekly", "productivity", "habit", "organise my week", "organize my week",
  "time management", "سير العمل", "روتين", "إنتاجية", "الإنتاجية", "تنظيم الوقت", "أسبوعي",
  "flujo de trabajo", "rutina", "productividad", "hábito", "flux de travail", "productivité", "habitude",
  "arbeitsablauf", "produktivität", "gewohnheit", "arbeidsflyt", "rutine", "produktivitet",
];

/**
 * Getting a new employee started: the most searched team process there is
 * ("onboarding checklist", see claude/ZAVQERA_PAYING_SEGMENT_CHECKLISTS in
 * the project) and the example in the box. Phrases, not single words, so
 * hiring someone ("hire a new employee", "توظيف موظف جديد") stays a hiring
 * plan and a new client is not a new employee.
 */
const ONBOARDING = [
  "onboard", "onboarding", "onboard a new employee", "onboard a new hire", "new hire", "new starter",
  "employee onboarding", "first day of a new employee",
  "استقبال موظف", "استقبال الموظف", "استقبال موظفة", "استقبال الموظفين", "تهيئة موظف", "تهيئة الموظف",
  "تهيئة الموظفين", "تأهيل موظف جديد",
  "incorporar a un nuevo empleado", "incorporación de un empleado", "incorporación de empleados",
  "intégrer un nouveau salarié", "intégration d'un salarié", "intégration d'un nouveau salarié",
  "accueillir un nouveau salarié", "einarbeiten", "einarbeitung", "neuen mitarbeiter einarbeiten",
  "ta imot en ny ansatt", "ta imot ny ansatt", "onboarde", "nyansatt",
];

/**
 * Closing the month's books: a process every business repeats twelve times a
 * year, which is what a paid plan's own templates are for. First under the box.
 * "End of the month" alone is not listed: a trip can be at the end of a month.
 */
const MONTH_END = [
  "month end", "month end close", "close the month", "close the books", "month's books", "monthly close",
  "close the month's books", "closing the books",
  "إغلاق حسابات نهاية الشهر", "حسابات نهاية الشهر", "إقفال حسابات الشهر", "إقفال الشهر", "إغلاق الشهر",
  "الإقفال الشهري", "الإغلاق الشهري", "إقفال الحسابات", "إغلاق الحسابات",
  "cierre mensual", "cerrar las cuentas del mes", "cierre contable", "cerrar el mes",
  "clôture mensuelle", "clôture comptable", "clôturer le mois",
  "monatsabschluss", "abschluss des monats",
  "månedsavslutning", "avslutte regnskapet", "månedsregnskap",
];

/** Onboarding a client, not an employee. */
const CLIENT = [
  "client", "clients", "customer", "customers", "عميل", "العميل", "عملاء", "cliente", "clientes",
  "kunde", "kunden", "kunder",
];

const LAUNCH = [
  "launch", "side project", "project", "new project", "مشروع", "إطلاق", "اطلاق", "أطلق", "lanzar",
  "proyecto", "lancer", "projet", "projekt", "lansere", "prosjekt",
];

/** Whitespace collapsed, control characters gone, cut to a sentence. */
export function normaliseGoal(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GOAL_MAX_LENGTH)
    .trim();
}

/** Hyphens and curly apostrophes read the same as their plain forms. */
function comparable(goal) {
  return goal.replace(/[-‐‑–]/g, " ").replace(/[’ʼ]/g, "'");
}

const score = (text, keywords) => 3 * matchStrength(text, keywords);

/** "US" and "U.S." are only the country when written in capitals. */
function namesUnitedStates(raw, text) {
  return /(^|[^A-Za-z])(US|U\.S\.?|USA)([^A-Za-z]|$)/.test(raw) || score(text, UNITED_STATES) > 0;
}

/** "EIN" is a German article in lower case, so only the capitals count. */
function namesEin(raw, text) {
  return /(^|[^A-Za-z])EIN([^A-Za-z]|$)/.test(raw) || score(text, EIN) > 0;
}

/**
 * Which plan a goal gets: { source: "guide" | "checklist" | "template" | "planner", id,
 * licensed? }. Null when the goal is too short to read. A goal that matches
 * nothing specific still gets the planner's general plan, because the point
 * of the box is that every visitor sees something they can start.
 */
export function matchGoal(value) {
  const raw = normaliseGoal(value);
  if (raw.length < GOAL_MIN_LENGTH) return null;
  const text = comparable(raw);
  const us = namesUnitedStates(raw, text) ? 6 : 0;
  const candidates = [];
  const add = (source, id, points, rank) => { if (points > 0) candidates.push({ source, id, points, rank }); };

  // Guides are specific to a country and need the country named, except
  // where the subject only exists in one (an LLC, an EIN are American).
  const germany = score(text, GERMANY);
  const relocate = score(text, RELOCATE) + score(text, JOB);
  if (germany > 0 && relocate > 0) add("guide", "moving-to-germany-checklist", germany + relocate, 3);
  const unitedKingdom = score(text, UNITED_KINGDOM);
  if (unitedKingdom > 0 && relocate > 0) add("guide", "moving-to-the-uk-checklist", unitedKingdom + relocate, 3);
  const llc = score(text, LLC);
  if (llc > 0) add("guide", "how-to-start-an-llc", llc + us, 3);
  if (namesEin(raw, text)) add("guide", "how-to-get-an-ein", 6 + us, 3);
  const businessPlan = score(text, BUSINESS_PLAN);
  if (businessPlan > 0) add("guide", "how-to-write-a-business-plan", businessPlan + 3, 3);
  const bankAccount = score(text, BUSINESS_BANK_ACCOUNT);
  if (bankAccount > 0 && (us > 0 || llc > 0)) add("guide", "how-to-open-a-business-bank-account", bankAccount + us + llc, 3);
  const business = score(text, BUSINESS);
  if (business > 0 && us > 0) add("guide", "how-to-start-a-business", business + us, 2.5);

  // A ready-made checklist beats a template on its own subject.
  const onboarding = score(text, ONBOARDING);
  if (onboarding > 0) {
    add("checklist", score(text, CLIENT) > 0 ? "client-onboarding-checklist" : "employee-onboarding-checklist", onboarding + 3, 2.5);
  }

  const monthEnd = score(text, MONTH_END);
  if (monthEnd > 0) add("checklist", "month-end-close-checklist", monthEnd + 3, 2.5);

  add("template", "find-a-job", score(text, JOB), 2);
  add("template", "organise-an-event", score(text, EVENT), 2);
  add("template", "settle-new-country", score(text, SETTLE), 2);
  add("template", "business-opportunity-scan", score(text, GROWTH), 2);
  add("template", "research-decision", score(text, DECISION), 2);
  add("template", "weekly-operations", score(text, WORKFLOW), 2);
  // A word like "project" says little on its own; the planner's own
  // reading of the same sentence is usually the better plan.
  add("template", "launch-plan", score(text, LAUNCH) - 0.5, 0.5);

  const planner = suggestPlanFor({ name: raw, intent: raw });
  const plannerPoints = planScoreFor({ name: raw, intent: raw });
  if (planner && planner.kind !== "generic") add("planner", planner.kind, plannerPoints, 1);
  // "Start a business" with no country named: the venture plan (licence,
  // customers, prices, costs) fits better than a general one.
  // Opening an account for a business is not opening a business (and "bank"
  // would otherwise make it a licensed one).
  if (business > 0 && bankAccount === 0 && score(text, START_VERBS) > 0) add("planner", "venture", business + 3, 1);

  if (!candidates.length) return { source: "planner", id: "generic", licensed: false };
  candidates.sort((a, b) => b.points - a.points || b.rank - a.rank);
  const best = candidates[0];
  if (best.source === "planner") {
    return { source: "planner", id: best.id, licensed: best.id === "venture" && needsLicence(raw) };
  }
  return { source: best.source, id: best.id };
}

/**
 * The goal as a mission name: the person's own words, tidied. First letter
 * up where the script has case, no closing full stop, at most 100 characters
 * cut at a word.
 */
export function goalTitle(value) {
  let title = normaliseGoal(value).replace(/[.!?؟。]+$/u, "").trim();
  if (title.length > 100) {
    const cut = title.slice(0, 100);
    const space = cut.lastIndexOf(" ");
    title = `${(space > 60 ? cut.slice(0, space) : cut).trim()}…`;
  }
  return title ? title[0].toLocaleUpperCase() + title.slice(1) : title;
}
