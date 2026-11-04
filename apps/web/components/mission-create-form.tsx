"use client";

import { useEffect, useState } from "react";
import { LocalizedText } from "./localized-text";
import { getMissionStarterExamples } from "../lib/mission-starter-examples.mjs";

type Plan = { title: string; summary: string; successCriteria: string[]; steps: { title: string; reason: string }[]; clarifyingQuestions: string[] };

export function MissionCreateForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [goal, setGoal] = useState("");
  const [boundaries, setBoundaries] = useState("");
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [criteria, setCriteria] = useState("");
  const [actions, setActions] = useState("");
  const [language, setLanguage] = useState<"en" | "nb" | "ar" | "es" | "fr" | "de">("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<{remaining:number; monthly_limit:number} | null>(null);
  const [drafted, setDrafted] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [planPreview, setPlanPreview] = useState<Plan | null>(null);

  useEffect(() => {
    const syncLanguage = () => {
      let saved: string | null = null;
      try { saved = window.localStorage.getItem("zavqera-language"); } catch { /* storage may be blocked */ }
      const cookie = document.cookie.split("; ").find((part) => part.startsWith("zavqera-language="))?.split("=")[1];
      const candidate = saved || cookie || navigator.language.toLowerCase().split("-")[0];
      setLanguage(["en", "ar", "nb", "es", "fr", "de"].includes(candidate) ? candidate as "en" | "nb" | "ar" | "es" | "fr" | "de" : "en");
    };
    syncLanguage();
    try {
      const saved = window.sessionStorage.getItem("zavqera-anonymous-plan-v2");
      if (saved) {
        const parsed = JSON.parse(saved) as { goal?: unknown; plan?: Plan };
        if (typeof parsed.goal === "string" && parsed.plan?.title && parsed.plan?.summary && Array.isArray(parsed.plan.successCriteria) && Array.isArray(parsed.plan.steps) && Array.isArray(parsed.plan.clarifyingQuestions)) {
          const restoredPlan = parsed.plan;
          setGoal(parsed.goal);
          setName(restoredPlan.title);
          setIntent(parsed.goal.trim());
          setCriteria(restoredPlan.successCriteria.join("\n"));
          setActions(restoredPlan.steps.map((step) => step.title + (step.reason ? " — " + step.reason : "")).join("\n"));
          setPlanPreview(restoredPlan);
          setDrafted(true);
          window.sessionStorage.removeItem("zavqera-anonymous-plan-v2");
        }
      }
    } catch {}
    const onLanguageChange = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      setLanguage(["en", "ar", "nb", "es", "fr", "de"].includes(value) ? value as "en" | "nb" | "ar" | "es" | "fr" | "de" : "en");
    };
    window.addEventListener("zavqera-language-change", onLanguageChange);
    void fetch("/api/ai/usage", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((value) => { if (value && typeof value.remaining === "number" && typeof value.monthly_limit === "number") setUsage(value); })
      .catch(() => undefined);
    return () => window.removeEventListener("zavqera-language-change", onLanguageChange);
  }, []);

  async function draftWithAi() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": crypto.randomUUID() },
        body: JSON.stringify({ goal: goal.trim() + (boundaries.trim() ? `\n\nMission boundaries and permissions:\n${boundaries.trim()}` : "") }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Could not create a plan.");
        return;
      }
      const plan = result as Plan;
      setName((current) => current || plan.title);
      setIntent(goal.trim());
      setCriteria(plan.successCriteria.join("\n"));
      setActions(plan.steps.map((step) => step.title + (step.reason ? " — " + step.reason : "")).join("\n"));
      setPlanPreview(plan);
      setDrafted(true);
    } catch {
      setError("Could not reach the AI planner. Please try again.");
    } finally { setLoading(false); }
  }

  const copy = {
    en: {
      goalPlaceholder: "Example: launch a small online shop in six weeks",
      namePlaceholder: "e.g. Launch my online shop",
      intentPlaceholder: "What should this mission help you accomplish?",
      criteriaPlaceholder: "One criterion per line",
      actionsPlaceholder: "One step per line",
      boundariesPlaceholder: "Example: Public research only; budget under €500; do not send messages, make purchases, or change accounts.",
      boundariesHelp: "Set budget or deadline limits, allowed sources, and actions that must stay off-limits. These boundaries are included in the mission.",
    },
    nb: {
      goalPlaceholder: "Eksempel: lanser en liten nettbutikk innen seks uker",
      namePlaceholder: "For eksempel: Lanser nettbutikken min",
      intentPlaceholder: "Hva skal oppdraget hjelpe deg med å oppnå?",
      criteriaPlaceholder: "Ett kriterium per linje",
      actionsPlaceholder: "Ett steg per linje",
      boundariesPlaceholder: "Eksempel: Bare offentlig research; budsjett under €500; ikke send meldinger eller kjøp noe.",
      boundariesHelp: "Angi budsjett- eller tidsgrenser, tillatte kilder og handlinger som ikke er tillatt. Grensene lagres med oppdraget.",
    },
    ar: {
      goalPlaceholder: "مثال: أريد إطلاق متجر إلكتروني صغير خلال ستة أسابيع",
      namePlaceholder: "مثال: إطلاق متجري الإلكتروني",
      intentPlaceholder: "ما الذي تريد أن تساعدك هذه المهمة على تحقيقه؟",
      criteriaPlaceholder: "اكتب معيارًا واحدًا في كل سطر",
      actionsPlaceholder: "اكتب خطوة واحدة في كل سطر",
      boundariesPlaceholder: "مثال: البحث في المصادر العامة فقط؛ الميزانية أقل من 500 يورو؛ لا ترسل رسائل ولا تشترِ شيئًا ولا تغيّر الحسابات.",
      boundariesHelp: "حدّد الميزانية أو الموعد النهائي والمصادر المسموحة والإجراءات الممنوعة. ستُحفظ هذه الحدود مع المهمة.",
    },
    es: {
      goalPlaceholder: "Ejemplo: lanzar una pequeña tienda en línea en seis semanas",
      namePlaceholder: "p. ej., lanzar mi tienda en línea",
      intentPlaceholder: "¿Qué debería ayudarte a lograr esta misión?",
      criteriaPlaceholder: "Un criterio por línea",
      actionsPlaceholder: "Un paso por línea",
      boundariesPlaceholder: "Ejemplo: solo investigación pública; presupuesto inferior a 500 €; no enviar mensajes ni comprar ni cambiar cuentas.",
      boundariesHelp: "Indica límites de presupuesto o plazo, fuentes permitidas y acciones prohibidas. Estos límites se guardarán con la misión.",
    },
    fr: {
      goalPlaceholder: "Exemple : lancer une petite boutique en ligne en six semaines",
      namePlaceholder: "Ex. : lancer ma boutique en ligne",
      intentPlaceholder: "Quel résultat cette mission doit-elle vous aider à atteindre ?",
      criteriaPlaceholder: "Un critère par ligne",
      actionsPlaceholder: "Une étape par ligne",
      boundariesPlaceholder: "Exemple : recherche publique uniquement ; budget inférieur à 500 € ; aucun message, achat ou changement de compte.",
      boundariesHelp: "Précisez les limites de budget ou de délai, les sources autorisées et les actions interdites. Ces limites seront enregistrées avec la mission.",
    },
    de: {
      goalPlaceholder: "Beispiel: einen kleinen Onlineshop in sechs Wochen starten",
      namePlaceholder: "z. B. meinen Onlineshop starten",
      intentPlaceholder: "Welches Ergebnis soll diese Mission Ihnen ermöglichen?",
      criteriaPlaceholder: "Ein Kriterium pro Zeile",
      actionsPlaceholder: "Ein Schritt pro Zeile",
      boundariesPlaceholder: "Beispiel: nur öffentliche Recherche; Budget unter 500 €; keine Nachrichten senden, Käufe tätigen oder Konten ändern.",
      boundariesHelp: "Legen Sie Budget- oder Fristgrenzen, erlaubte Quellen und verbotene Aktionen fest. Diese Grenzen werden mit der Mission gespeichert.",
    },
  }[language];
  const examples = getMissionStarterExamples(language);
  const placeholder = copy.goalPlaceholder;
  const namePlaceholder = copy.namePlaceholder;
  const intentPlaceholder = copy.intentPlaceholder;
  const criteriaPlaceholder = copy.criteriaPlaceholder;
  const actionsPlaceholder = copy.actionsPlaceholder;
  const handleExampleClick = (value: string) => {
    setGoal(value);
    setError("");
  };

  return <form className="form-grid card mission-create-form" action={action}>
    <section className="mission-ai-draft" aria-labelledby="mission-ai-heading">
      <p className="eyebrow"><LocalizedText en="ZAVQERA AI" nb="ZAVQERA KI" ar="ZAVQERA بالذكاء الاصطناعي" /></p>
      <h2 id="mission-ai-heading"><LocalizedText en="Describe the outcome you want." nb="Beskriv resultatet du ønsker." ar="صف النتيجة التي تريد تحقيقها." /></h2>
      <p><LocalizedText en="Share the result, any deadline or budget, and what must not happen. ZAVQERA drafts the steps and success criteria for you to review." nb="Beskriv resultatet, eventuell tidsfrist eller budsjett, og hva som ikke må skje. ZAVQERA lager et utkast med steg og suksesskriterier som du kan gjennomgå." ar="اذكر النتيجة والموعد النهائي أو الميزانية وأي إجراءات ممنوعة. سيعدّ ZAVQERA مسودة للخطوات ومعايير النجاح لتراجعها." /></p>
      <div className="field">
        <label htmlFor="ai-goal"><LocalizedText en="Your goal" nb="Målet ditt" ar="هدفك" /></label>
        <textarea id="ai-goal" value={goal} onChange={(event) => { setGoal(event.target.value); setError(""); }} maxLength={1200} placeholder={placeholder} aria-describedby="ai-goal-help" />
        <small id="ai-goal-help"><LocalizedText en="Mention deadlines, budget limits, allowed research, and actions that must not happen. Nothing is executed automatically." nb="Nevn tidsfrister, budsjettgrenser, tillatt research og handlinger som ikke må skje. Ingenting utføres automatisk." ar="اذكر المواعيد والميزانية والبحث المسموح والإجراءات الممنوعة. لن يتم تنفيذ أي شيء تلقائيًا." /></small>
        <div className="goal-examples" aria-label="Example goals">
          <span><LocalizedText en="Try an example" nb="Prøv et eksempel" ar="جرّب مثالًا" /></span>
          {examples.map((example) => <button key={example.key} type="button" className="example-chip" onClick={() => handleExampleClick(example.goal)} title={example.goal}>{example.label}</button>)}
        </div>
      </div>
      <div className="field">
        <label htmlFor="ai-boundaries"><LocalizedText en="Boundaries and permissions" nb="Grenser og fullmakter" ar="الحدود والصلاحيات" /> <span className="field-optional"><LocalizedText en="optional" /></span></label>
        <textarea id="ai-boundaries" name="boundaries" value={boundaries} onChange={(event) => { setBoundaries(event.target.value); setError(""); }} maxLength={1000} placeholder={copy.boundariesPlaceholder} aria-describedby="ai-boundaries-help" />
        <small id="ai-boundaries-help">{copy.boundariesHelp}</small>
      </div>
      <button className="button" type="button" disabled={loading || !goal.trim()} onClick={draftWithAi}>
        {loading ? <LocalizedText en="Building your plan…" nb="Bygger planen din…" ar="جارٍ بناء خطتك…" /> : <LocalizedText en="Draft my mission" nb="Lag et oppdragsutkast" ar="أنشئ مسودة مهمتي" />}
      </button>
      {usage && <p className="ai-usage" aria-live="polite">{usage.remaining} / {usage.monthly_limit} <LocalizedText en="AI generations remaining this month." /></p>}
      {error && <p className="field-error" role="alert"><LocalizedText en={error} /></p>}
    </section>

    {!drafted && !manualOpen && (
      <button className="button button-quiet manual-details-trigger" type="button" onClick={() => setManualOpen(true)}>
        <LocalizedText en="Want more control? Add details" nb="Vil du ha mer kontroll? Legg til detaljer" ar="هل تريد تحكمًا أكبر؟ أضف التفاصيل" />
      </button>
    )}

    {drafted && planPreview && (
      <section className="ai-plan-preview" aria-labelledby="ai-plan-preview-heading">
        <div className="ai-plan-preview-header">
          <div>
            <p className="eyebrow"><LocalizedText en="AI draft" nb="KI-utkast" ar="مسودة الذكاء الاصطناعي" /></p>
            <h3 id="ai-plan-preview-heading"><LocalizedText en="Your mission draft is ready." nb="Oppdragsutkastet er klart." ar="مسودة المهمة جاهزة." /></h3>
          </div>
          <span className="ai-plan-review-badge"><LocalizedText en="Review and edit before creating" nb="Se gjennom og rediger før du oppretter" ar="راجع وعدّل قبل الإنشاء" /></span>
        </div>
        <div className="ai-plan-summary">
          <span className="ai-plan-label"><LocalizedText en="Mission" nb="Oppdrag" ar="المهمة" /></span>
          <h4>{planPreview.title}</h4>
        </div>
        <div className="ai-plan-summary">
          <span className="ai-plan-label"><LocalizedText en="Outcome" nb="Resultat" ar="النتيجة" /></span>
          <p>{planPreview.summary}</p>
        </div>
        <div className="ai-plan-summary">
          <span className="ai-plan-label"><LocalizedText en="Success looks like" nb="Slik ser suksess ut" ar="شكل النجاح" /></span>
          <ul>{planPreview.successCriteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
        </div>
        {planPreview.steps.length > 0 && (
          <div className="ai-plan-steps">
            <span className="ai-plan-label"><LocalizedText en="Suggested first steps" nb="Foreslåtte første steg" ar="الخطوات الأولى المقترحة" /></span>
            <ol>
              {planPreview.steps.map((step, index) => (
                <li key={`${step.title}-${index}`}>
                  <span className="ai-plan-step-number">{index + 1}</span>
                  <div><strong>{step.title}</strong>{step.reason && <span>{step.reason}</span>}</div>
                </li>
              ))}
            </ol>
          </div>
        )}
        {planPreview.clarifyingQuestions.length > 0 && <div className="ai-plan-summary">
          <span className="ai-plan-label"><LocalizedText en="Questions to refine later" nb="Spørsmål som kan avklare planen" ar="أسئلة لتحسين الخطة لاحقًا" /></span>
          <ul>{planPreview.clarifyingQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul>
        </div>}
        <p className="ai-plan-control"><LocalizedText en="Nothing is created or executed yet. You decide what stays." nb="Ingenting opprettes eller utføres ennå. Du bestemmer hva som skal beholdes." ar="لم يتم إنشاء أو تنفيذ أي شيء بعد. أنت تقرر ما الذي يبقى." /></p>
      </section>
    )}

    {(drafted || manualOpen) && <>
      <div className="review-heading">
        <p className="eyebrow"><LocalizedText en="Review and edit" /></p>
        {drafted && <p className="review-note"><LocalizedText en="Review or edit anything before creating the mission." nb="Se gjennom eller rediger før du oppretter oppdraget." ar="راجع أو عدّل أي شيء قبل إنشاء المهمة." /></p>}
      </div>
      <div className="field"><label htmlFor="name"><LocalizedText en="Mission name" /></label><input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={namePlaceholder} required /></div>
      <div className="field"><label htmlFor="intent"><LocalizedText en="Intent" /></label><textarea id="intent" name="intent" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder={intentPlaceholder} required /><small><LocalizedText en="The outcome you want this mission to achieve." /></small></div>
      <div className="field"><label htmlFor="criteria"><LocalizedText en="Success criteria" /></label><textarea id="criteria" name="criteria" value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder={criteriaPlaceholder} required /><small><LocalizedText en="How you will know this mission succeeded. One per line." /></small></div>
      <div className="field"><label htmlFor="actions"><LocalizedText en="First steps" /> <span className="field-optional"><LocalizedText en="optional" /></span></label><textarea id="actions" name="actions" value={actions} onChange={(e) => setActions(e.target.value)} placeholder={actionsPlaceholder} /><small><LocalizedText en="The work you already know about. You can add more later." /></small></div>
      <button className="button" type="submit"><LocalizedText en="Create mission" /></button>
    </>}
  </form>;
}
