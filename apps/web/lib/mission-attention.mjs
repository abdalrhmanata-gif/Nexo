// "What needs your attention" used to mean "whichever waiting mission was
// touched most recently". Recency is not urgency: a mission someone edited an
// hour ago outranked one that has been blocked for three weeks, and the panel
// never said why it had picked anything.
//
// This ranks by how stuck a mission actually is, and keeps the reason that
// earned it the top place. The reason is the point — a number with no account
// of itself is what made the rest of this product feel empty.

const DAY = 24 * 60 * 60 * 1000;

/** Signals, strongest first. The first that applies supplies the reason. */
function signalsFor(mission, now) {
  const signals = [];
  const live = (mission.actions ?? []).filter((action) => action.status !== "CANCELLED");

  if (mission.status === "WAITING") {
    signals.push({ weight: 60, reason: "Work is paused until you resolve the open decision." });
  }

  let worstOverdueDays = 0;
  let dueSoon = 0;
  for (const action of live) {
    if (!action.followUpAt || action.status === "COMPLETED") continue;
    const due = Date.parse(action.followUpAt);
    if (!Number.isFinite(due)) continue;
    if (due < now) worstOverdueDays = Math.max(worstOverdueDays, Math.floor((now - due) / DAY));
    else if (due <= now + 7 * DAY) dueSoon += 1;
  }
  if (worstOverdueDays > 0) {
    signals.push({
      weight: 50 + Math.min(worstOverdueDays, 30),
      reason: "A follow-up on this mission is already overdue.",
    });
  } else if (dueSoon > 0) {
    signals.push({ weight: 20, reason: "A follow-up on this mission falls due within the week." });
  }

  if (live.length === 0) {
    signals.push({ weight: 40, reason: "It states an outcome but holds no step that would reach it." });
  } else if (live.every((action) => action.status === "PENDING")) {
    signals.push({ weight: 18, reason: "Every step on this mission is still unstarted." });
  }

  const updated = Date.parse(mission.updated ?? "");
  if (Number.isFinite(updated)) {
    const idleDays = Math.floor((now - updated) / DAY);
    if (idleDays >= 14) {
      signals.push({
        weight: 12 + Math.min(Math.floor(idleDays / 7), 12),
        reason: "Nothing has moved on this mission for two weeks or more.",
      });
    }
  }

  return signals.sort((a, b) => b.weight - a.weight);
}

/**
 * How much this mission needs a person, and the single reason that most earned
 * it. A completed mission scores zero: it is finished, not ignored.
 */
export function attentionFor(mission, now = Date.now()) {
  if (!mission || mission.status === "COMPLETED") {
    return { score: 0, reason: null };
  }
  const signals = signalsFor(mission, now);
  if (signals.length === 0) return { score: 0, reason: null };
  return {
    // Every signal counts toward the score, so two mild problems can outrank
    // one moderate problem — but the reason shown is the strongest single one,
    // because a list of four reasons is not an answer to "what do I do now".
    score: signals.reduce((total, signal) => total + signal.weight, 0),
    reason: signals[0].reason,
  };
}

/** Missions that need a person, most stuck first. Ties keep the input order. */
export function rankByAttention(missions, now = Date.now()) {
  return (missions ?? [])
    .map((mission, index) => ({ mission, index, ...attentionFor(mission, now) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(({ mission, score, reason }) => ({ mission, score, reason }));
}
