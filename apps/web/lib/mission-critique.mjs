// "Plan health: No issues detected" was shown for a mission whose success
// criterion was "usa and canada" and whose only step was also "usa and canada".
// Nothing about that mission is healthy. The check only ever looked at
// lifecycle fields — statuses, counts, dates — and never read a word the
// person had written, so the one place that claimed to inspect the plan was
// the one place guaranteed not to notice it.
//
// This reads the words. Every finding quotes the text it is about, because a
// complaint you cannot locate is worse than silence.

/** Joiners and articles across the six shipped languages. */
const STOP_WORDS = new Set([
  "and", "or", "the", "a", "an", "to", "of", "in", "for", "my", "i", "want", "will", "with", "is", "be",
  "og", "eller", "en", "et", "den", "det", "til", "av", "i", "for", "min", "mitt", "jeg", "vil", "med", "er",
  "و", "أو", "ال", "في", "إلى", "الى", "من", "على", "مع", "أن", "أريد", "اريد", "ان",
  "y", "o", "el", "la", "los", "las", "un", "una", "de", "en", "para", "con", "mi", "quiero",
  "et", "ou", "le", "les", "des", "du", "un", "une", "dans", "pour", "avec", "mon", "je", "veux",
  "und", "oder", "der", "die", "das", "ein", "eine", "zu", "in", "für", "mit", "mein", "ich", "will",
]);

function words(text) {
  return String(text ?? "")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

const normalise = (text) => String(text ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");

/**
 * A criterion is checkable when someone else could look at it and say yes or
 * no. A bare noun phrase cannot be: "usa and canada" names a place, not a
 * result. The test is deliberately crude and language-neutral — a number or a
 * date, or enough words to carry a claim — because guessing at grammar across
 * six languages would fail in ways nobody could predict.
 */
function looksCheckable(text) {
  const value = String(text ?? "").trim();
  if (/\d/.test(value)) return true;
  return words(value).length >= 4;
}

/**
 * Findings about what the person actually wrote, strongest first. Each carries
 * a message key and the text to quote, so the caller can translate the message
 * and fill in the quotation.
 */
export function critiqueMission(mission) {
  const findings = [];
  const criteria = (mission?.criteria ?? []).filter((item) => String(item ?? "").trim());
  const live = (mission?.actions ?? []).filter((action) => action.status !== "CANCELLED");
  const goalWords = new Set([...words(mission?.name), ...words(mission?.intent)]);
  const criteriaKeys = new Set(criteria.map(normalise));

  if (criteria.length === 0) {
    findings.push({
      code: "no-criteria",
      severity: "high",
      message: "This mission has no success criteria, so nothing can ever mark it finished.",
      quote: null,
    });
  }

  for (const criterion of criteria) {
    if (!looksCheckable(criterion)) {
      findings.push({
        code: "criterion-not-checkable",
        severity: "high",
        message: "“{text}” names a subject, not a result someone could check. Add what must be true, a number, or a date.",
        quote: criterion,
      });
    }
  }

  if (live.length === 0) {
    findings.push({
      code: "no-actions",
      severity: "high",
      message: "No step has been recorded, so nothing can move.",
      quote: null,
    });
  }

  for (const action of live) {
    const title = action.title ?? "";
    const tokens = words(title);
    if (tokens.length === 0) continue;
    if (criteriaKeys.has(normalise(title))) {
      findings.push({
        code: "action-repeats-criterion",
        severity: "high",
        message: "“{text}” is also a success criterion. A criterion is how you judge the result; a step is work you do.",
        quote: title,
      });
    } else if (tokens.every((token) => goalWords.has(token))) {
      findings.push({
        code: "action-restates-goal",
        severity: "high",
        message: "“{text}” uses only words already in the goal, so it restates the outcome instead of naming work.",
        quote: title,
      });
    }
  }

  if (live.length > 0 && live.every((action) => !action.followUpAt)) {
    findings.push({
      code: "no-follow-up",
      severity: "info",
      message: "No step carries a follow-up date, so nothing here will ever ask for you.",
      quote: null,
    });
  }

  const order = { high: 0, info: 1 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * True when a mission holds no work that would move it. Wider than "no
 * actions": a step that repeats the goal or a criterion is not a plan, which
 * is what a freshly written mission usually contains.
 */
export function planIsThin(mission) {
  const live = (mission?.actions ?? []).filter((action) => action.status !== "CANCELLED");
  if (live.length === 0) return true;
  const criteriaKeys = new Set((mission?.criteria ?? []).map(normalise));
  const goalWords = new Set([...words(mission?.name), ...words(mission?.intent)]);
  const name = normalise(mission?.name);

  return live.every((action) => {
    const title = normalise(action.title);
    const tokens = words(title);
    if (!title) return true;
    if (criteriaKeys.has(title)) return true;
    if (title === name || (name && (name.includes(title) || title.includes(name)))) return true;
    return tokens.length > 0 && tokens.every((token) => goalWords.has(token));
  });
}
