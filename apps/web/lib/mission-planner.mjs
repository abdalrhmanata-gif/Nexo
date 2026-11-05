// A stated outcome deserves a first plan. Creating a mission used to leave the
// page echoing the words the user had just typed: "bra apotek" came back as the
// next action, the success criterion and the plan health, which reads as an
// empty product rather than a careful one.
//
// This module proposes that first plan. It is deterministic and local: no model
// call, no network, no provider key, so it answers instantly, works offline and
// costs nothing to run. What it proposes is structure and the questions worth
// answering — never an asserted fact about law, price or market. That matches
// the rest of the product: every claim must be evidence the user gathered, not
// a sentence this app invented.

/** Intent keywords per plan kind, across the languages the product ships in. */
const VENTURE_VERBS = [
  "open", "opening", "start", "starting", "set up", "launch a shop", "launch a store",
  "åpne", "åpner", "starte", "starter", "etablere",
  "افتتاح", "افتح", "أفتح", "انشاء", "إنشاء", "تأسيس", "فتح",
  "abrir", "montar", "ouvrir", "créer", "eröffnen", "gründen",
];

const VENTURE_PLACES = [
  "shop", "store", "pharmacy", "clinic", "restaurant", "cafe", "café", "gym", "salon",
  "bakery", "boutique", "branch", "office", "studio", "practice", "kiosk",
  "apotek", "butikk", "klinikk", "kafé", "bakeri", "treningssenter", "frisør", "verksted",
  "صيدلية", "متجر", "محل", "مطعم", "مقهى", "عيادة", "مخبز", "صالون", "ورشة", "فرع", "مكتب",
  "farmacia", "tienda", "restaurante", "pharmacie", "magasin", "boulangerie",
  "apotheke", "laden", "geschäft", "praxis",
];

/** Venture types whose first obstacle is a licence, not a customer. */
const LICENSED = [
  "pharmacy", "apotek", "صيدلية", "farmacia", "pharmacie", "apotheke",
  "clinic", "klinikk", "عيادة", "clinica", "clínica", "praxis",
  "restaurant", "cafe", "café", "kafé", "مطعم", "مقهى", "bakery", "bakeri", "مخبز",
  "boulangerie", "restaurante", "school", "skole", "مدرسة", "barnehage", "nursery",
  "bank", "insurance", "forsikring", "بنك", "تأمين", "taxi", "transport",
];

const TRAVEL_WORDS = [
  "travel", "trip", "visit", "holiday", "vacation", "journey", "fly", "flight", "tour",
  "reise", "ferie", "tur", "besøke", "flytur",
  "سفر", "أسافر", "اسافر", "رحلة", "زيارة", "عطلة", "سياحة",
  "viajar", "viaje", "vacaciones", "voyage", "voyager", "vacances",
  "reisen", "urlaub", "flug",
];

const MOVE_WORDS = [
  "move to", "relocate", "emigrate", "immigrate", "residence permit",
  "flytte", "utvandre", "oppholdstillatelse",
  "انتقال", "الهجرة", "هجرة", "إقامة", "اقامة",
  "mudarse", "emigrar", "déménager", "umziehen", "auswandern",
];

const STUDY_WORDS = [
  "study", "degree", "university", "course", "certification", "exam", "learn",
  "studere", "studium", "universitet", "kurs", "eksamen", "lære",
  "دراسة", "أدرس", "ادرس", "جامعة", "شهادة", "دورة", "امتحان", "تعلم",
  "estudiar", "universidad", "curso", "étudier", "université", "studieren", "prüfung",
];

const PRODUCT_WORDS = [
  "app", "product", "feature", "platform", "website", "service", "saas",
  "produkt", "nettside", "tjeneste", "منتج", "تطبيق", "منصة", "موقع", "خدمة",
  "producto", "produit", "aplicación", "application", "anwendung",
];

const HIRING_WORDS = [
  "hire", "recruit", "team", "staff", "ansette", "rekruttere", "team", "ansatte",
  "توظيف", "تعيين", "فريق", "contratar", "embaucher", "einstellen",
];

function haystack(mission) {
  return [mission?.name, mission?.intent, ...(mission?.criteria ?? [])]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();
}

function mentions(text, words) {
  return words.some((word) => text.includes(word.toLocaleLowerCase()));
}

const VENTURE_STEPS = [
  "Identify the authority that licenses this kind of business, and record in writing exactly what it requires",
  "Describe precisely who you serve, where they are, and how far they will travel",
  "Visit the places that already serve them and write down their prices and their gaps",
  "Work out the setup cost, the monthly running cost, and how many customers cover both",
  "Shortlist locations and confirm the lease terms and permitted use for each",
  "List the suppliers and the qualified people you must have on the opening day",
  "Set the opening date, and write down what would make you stop instead",
];

const VENTURE_CRITERIA = [
  "The licensing requirements are confirmed in writing by the responsible authority",
  "The break-even number of customers is calculated from real observed prices",
  "A location is secured on terms you have read in full",
];

const PRODUCT_STEPS = [
  "Write the one sentence a user would say that proves this was worth building",
  "Name the riskiest assumption this depends on, and why it might be wrong",
  "Find the cheapest test that could prove that assumption wrong this week",
  "Define what you will measure, and the number that means stop",
  "Decide who reviews the evidence with you, and when",
];

const HIRING_STEPS = [
  "Write down the work that is not getting done today, in hours per week",
  "Define what this person must be able to do unsupervised after three months",
  "Agree the budget, the level, and who makes the final decision",
  "Prepare the one task that shows whether a candidate can actually do the work",
  "Set the date you will decide, with or without the perfect candidate",
];

const TRAVEL_STEPS = [
  "Write the dates, and what has to be true before you can leave on them",
  "Check what each destination requires from someone with your passport, and how long it takes to get",
  "Price the whole trip — travel, stay, moving around, eating, and a margin for the unplanned",
  "Book the one thing that is hardest to change, and build the rest around it",
  "List what must be arranged at home while you are away",
  "Write down what you would do if a leg of it falls through",
];

const TRAVEL_CRITERIA = [
  "Entry requirements are confirmed from the official source for your passport",
  "The full cost is written down, including a margin for the unplanned",
];

const MOVE_STEPS = [
  "Confirm what residence permits your situation needs, and the processing time for each",
  "Work out what the first twelve months cost before any income arrives",
  "Check what your qualifications are worth there, and what recognition takes",
  "Decide what happens to what you hold now — home, contracts, commitments",
  "Set the date you decide, and what evidence would make you stay",
];

const STUDY_STEPS = [
  "Write what you will be able to do at the end that you cannot do now",
  "Compare the real entry requirements, cost and length of the options",
  "Check what the qualification is accepted for where you intend to use it",
  "Plan the hours per week against what your life already holds",
  "Set the checkpoint where you confirm it is still worth continuing",
];

const GENERIC_STEPS = [
  "Write what success looks like in one sentence you could measure",
  "List what must be true for this to work, and mark which you have not checked",
  "Pick the cheapest way to check the one that would hurt most if it were false",
  "Set the date you will look at the evidence and decide",
];

const GENERIC_CRITERIA = [
  "Every assumption is either checked against evidence or openly marked unknown",
];

/**
 * Propose a first plan for a stated outcome. Returns null when the mission says
 * too little to say anything useful about — proposing a generic plan for an
 * empty intent would be noise, not help.
 */
export function suggestPlanFor(mission) {
  const text = haystack(mission);
  if (text.trim().length < 6) return null;

  const venture = mentions(text, VENTURE_PLACES) || (mentions(text, VENTURE_VERBS) && mentions(text, VENTURE_PLACES));
  if (venture) {
    return {
      kind: "venture",
      licensed: mentions(text, LICENSED),
      steps: VENTURE_STEPS,
      criteria: VENTURE_CRITERIA,
    };
  }
  if (mentions(text, MOVE_WORDS)) {
    return { kind: "move", licensed: false, steps: MOVE_STEPS, criteria: GENERIC_CRITERIA };
  }
  if (mentions(text, TRAVEL_WORDS)) {
    return { kind: "travel", licensed: false, steps: TRAVEL_STEPS, criteria: TRAVEL_CRITERIA };
  }
  if (mentions(text, STUDY_WORDS)) {
    return { kind: "study", licensed: false, steps: STUDY_STEPS, criteria: GENERIC_CRITERIA };
  }
  if (mentions(text, HIRING_WORDS)) {
    return { kind: "hiring", licensed: false, steps: HIRING_STEPS, criteria: GENERIC_CRITERIA };
  }
  if (mentions(text, PRODUCT_WORDS)) {
    return { kind: "product", licensed: false, steps: PRODUCT_STEPS, criteria: GENERIC_CRITERIA };
  }
  return { kind: "generic", licensed: false, steps: GENERIC_STEPS, criteria: GENERIC_CRITERIA };
}

/** The headline a plan card uses, chosen by what the plan recognised. */
export function planHeadline(kind) {
  switch (kind) {
    case "venture": return "Opening something takes these seven steps";
    case "hiring": return "Hiring well starts with these five steps";
    case "product": return "Before building, settle these five things";
    case "travel": return "A trip holds together on these six";
    case "move": return "Moving countries turns on these five";
    case "study": return "Committing years to study starts with these five";
    default: return "A first plan for this outcome";
  }
}
