import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";

const templates = [
  {
    id: "launch-plan",
    title: "Launch a small project",
    description: "Turn an idea into a bounded launch plan with clear milestones.",
    intent: "Prepare and validate a small project launch while keeping cost, timing, and risk visible.",
    criteria: ["Define the target audience and outcome", "Validate demand with credible evidence", "Create a milestone plan and budget"],
    actions: ["Describe the target user and problem", "Collect evidence for demand", "Draft milestones, costs, and risks"],
  },
  {
    id: "research-decision",
    title: "Make an evidence-based decision",
    description: "Compare options, preserve uncertainty, and document the decision.",
    intent: "Compare realistic options using trustworthy evidence and make a decision with assumptions and uncertainties clearly stated.",
    criteria: ["Identify at least two realistic options", "Record supporting and contradictory evidence", "Document a decision and remaining unknowns"],
    actions: ["Define the decision and constraints", "Collect primary or authoritative sources", "Compare options and record open questions"],
  },
  {
    id: "weekly-operations",
    title: "Improve a weekly workflow",
    description: "Find friction in recurring work and measure a safe improvement.",
    intent: "Improve one recurring workflow without disrupting critical operations, and confirm whether the change helped.",
    criteria: ["Describe the current workflow and baseline", "Test one reversible improvement", "Compare the outcome with the baseline"],
    actions: ["Map the current steps and bottlenecks", "Choose a small reversible change", "Review results and decide whether to keep it"],
  },
];

function templateHref(template: typeof templates[number]) {
  const params = new URLSearchParams({
    name: template.title,
    intent: template.intent,
    criteria: template.criteria.join("\n"),
    actions: template.actions.join("\n"),
  });
  return `/app/missions/new?${params.toString()}`;
}

export default function TemplatesPage() {
  return <div className="container templates-page">
    <section className="hero template-hero-panel">
      <p className="eyebrow"><LocalizedText en="Mission templates" nb="Oppdragsmaler" ar="قوالب المهام" /></p>
      <h1><LocalizedText en="Start with a useful first plan." nb="Start med en nyttig første plan." ar="ابدأ بخطة أولية مفيدة." /></h1>
      <p><LocalizedText en="Choose a starting point, review every field, and keep control of the mission before you create it." nb="Velg et utgangspunkt, gå gjennom feltene og behold kontrollen før du oppretter oppdraget." ar="اختر نقطة بداية وراجع كل حقل واحتفظ بالتحكم قبل إنشاء المهمة." /></p>
    </section>
    <section className="grid" aria-label="Mission templates">
      {templates.map((template) => <article className="card template-card" key={template.id}>
        <p className="eyebrow"><LocalizedText en="Mission template" nb="Oppdragsmal" ar="قالب مهمة" /></p>
        <h2><LocalizedText en={template.title} nb={template.title} ar={template.title} /></h2>
        <p><LocalizedText en={template.description} nb={template.description} ar={template.description} /></p>
        <ul className="template-criteria">{template.criteria.map((criterion) => <li key={criterion}><LocalizedText en={criterion} nb={criterion} ar={criterion} /></li>)}</ul>
        <Link className="button" href={templateHref(template)}><LocalizedText en="Use this template" nb="Bruk denne malen" ar="استخدم هذا القالب" /></Link>
      </article>)}
    </section>
    <p className="action-hint template-note"><LocalizedText en="A template only pre-fills a draft. Nothing is created until you review it and submit the mission form." nb="En mal fyller bare ut et utkast. Ingenting opprettes før du har gjennomgått og sendt inn skjemaet." ar="القالب يملأ مسودة فقط. لا تُنشأ أي مهمة حتى تراجع النموذج وترسله." /></p>
  </div>;
}
