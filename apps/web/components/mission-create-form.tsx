"use client";

import { useEffect, useState } from "react";
import { LocalizedText } from "./localized-text";

type Plan = { title: string; summary: string; successCriteria: string[]; steps: { title: string; reason: string }[]; clarifyingQuestions: string[] };

export function MissionCreateForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [goal, setGoal] = useState("");
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [criteria, setCriteria] = useState("");
  const [actions, setActions] = useState("");
  const [language, setLanguage] = useState("en");
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
      setLanguage(candidate === "ar" || candidate === "nb" ? candidate : "en");
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
      setLanguage(value === "ar" || value === "nb" ? value : "en");
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
        body: JSON.stringify({ goal }),
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

  const placeholder = language === "ar" ? "مثال: أريد إطلاق متجر إلكتروني صغير خلال ستة أسابيع" : language === "nb" ? "Eksempel: lanser en liten nettbutikk innen seks uker" : "Example: launch a small online shop in six weeks";
  const namePlaceholder = language === "ar" ? "مثال: إطلاق متجري الإلكتروني" : language === "nb" ? "For eksempel: Lanser nettbutikken min" : "e.g. Launch my online shop";
  const intentPlaceholder = language === "ar" ? "ما النتيجة التي تريد الوصول إليها؟" : language === "nb" ? "Hva ønsker du å oppnå med oppdraget?" : "What should this mission help you accomplish?";
  const criteriaPlaceholder = language === "ar" ? "اكتب معيارًا واحدًا في كل سطر" : language === "nb" ? "Ett kriterium per linje" : "One criterion per line";
  const actionsPlaceholder = language === "ar" ? "اكتب خطوة واحدة في كل سطر" : language === "nb" ? "Ett steg per linje" : "One step per line";
  const examples = language === "ar"
    ? ["أريد إطلاق متجر إلكتروني صغير خلال ستة أسابيع", "أريد تجهيز طلب تأشيرة السفر", "أريد تنظيم مشروع جانبي مع عملي"]
    : language === "nb"
      ? ["Jeg vil lansere en liten nettbutikk innen seks uker", "Jeg vil gjøre en visumsøknad klar", "Jeg vil organisere et sideprosjekt ved siden av jobben"]
      : ["Launch a small online shop in six weeks", "Get my visa application ready", "Organize a side project alongside my job"];
  const handleExampleClick = (value: string) => {
    setGoal(value);
    setError("");
  };

  return <form className="form-grid card mission-create-form" action={action}>
    <section className="mission-ai-draft" aria-labelledby="mission-ai-heading">
      <p className="eyebrow"><LocalizedText en="ZAVQERA AI" nb="ZAVQERA KI" ar="ZAVQERA بالذكاء الاصطناعي" /></p>
      <h2 id="mission-ai-heading"><LocalizedText en="Tell ZAVQERA what you want." nb="Fortell ZAVQERA hva du vil." ar="أخبر ZAVQERA بما تريد." /></h2>
      <p><LocalizedText en="Just describe the outcome. ZAVQERA will shape the plan for you." nb="Beskriv bare resultatet. ZAVQERA lager planen for deg." ar="اشرح فقط النتيجة التي تريدها. ZAVQERA ستبني الخطة لك." /></p>
      <div className="field">
        <label htmlFor="ai-goal"><LocalizedText en="Your goal" nb="Målet ditt" ar="هدفك" /></label>
        <textarea id="ai-goal" value={goal} onChange={(event) => { setGoal(event.target.value); setError(""); }} maxLength={1200} placeholder={placeholder} aria-describedby="ai-goal-help" />
        <small id="ai-goal-help"><LocalizedText en="Describe the result, not the project structure. You can be messy." nb="Beskriv resultatet, ikke prosjektstrukturen. Du kan skrive fritt." ar="اشرح النتيجة، وليس هيكل المشروع. يمكنك الكتابة بحرية." /></small>
        <div className="goal-examples" aria-label="Example goals">
          <span><LocalizedText en="Try an example" nb="Prøv et eksempel" ar="جرّب مثالًا" /></span>
          {examples.map((example) => <button key={example} type="button" className="example-chip" onClick={() => handleExampleClick(example)}>{example}</button>)}
        </div>
      </div>
      <button className="button" type="button" disabled={loading || !goal.trim()} onClick={draftWithAi}>
        {loading ? <LocalizedText en="Building your plan…" nb="Bygger planen din…" ar="جارٍ بناء خطتك…" /> : <LocalizedText en="Build my plan" nb="Bygg planen min" ar="ابنِ خطتي" />}
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
            <h3 id="ai-plan-preview-heading"><LocalizedText en="Your plan is ready." nb="Planen din er klar." ar="خطتك جاهزة." /></h3>
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
