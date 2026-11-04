export const MISSION_STARTER_EXAMPLES = {
  en: [
    { key: "project", label: "Plan a project", goal: "Plan a product launch in four weeks with milestones, a budget, and a launch checklist. Do not make purchases." },
    { key: "research", label: "Research & compare", goal: "Compare three project management tools for a small team. Compare pricing, strengths, and limitations. Do not create accounts or subscribe." },
    { key: "team-follow-up", label: "Team follow-up", goal: "Prepare follow-up for three leads this week. Prioritize next steps and draft suggestions, but do not send messages." },
  ],
  nb: [
    { key: "project", label: "Planlegg et prosjekt", goal: "Planlegg en produktlansering om fire uker med milepæler, budsjett og sjekkliste. Ikke foreta kjøp." },
    { key: "research", label: "Undersøk og sammenlign", goal: "Sammenlign tre prosjektverktøy for et lite team. Vurder pris, styrker og begrensninger. Ikke opprett konto eller abonnement." },
    { key: "team-follow-up", label: "Følg opp teamet", goal: "Forbered oppfølging av tre leads denne uken. Prioriter neste steg og lag forslag, men ikke send meldinger." },
  ],
  ar: [
    { key: "project", label: "خطط لمشروع", goal: "خطط لإطلاق منتج خلال أربعة أسابيع، مع مراحل وميزانية وقائمة تحقق. لا تُجرِ أي عمليات شراء." },
    { key: "research", label: "ابحث وقارن", goal: "قارن بين ثلاث أدوات لإدارة المشاريع لفريق صغير من حيث السعر ونقاط القوة والقيود. لا تنشئ حسابات أو اشتراكات." },
    { key: "team-follow-up", label: "متابعة الفريق", goal: "جهّز خطة متابعة لثلاثة عملاء محتملين هذا الأسبوع. رتّب الأولويات واكتب مقترحات، لكن لا ترسل رسائل." },
  ],
  es: [
    { key: "project", label: "Planificar un proyecto", goal: "Planifica el lanzamiento de un producto en cuatro semanas con hitos, presupuesto y lista de lanzamiento. No hagas compras." },
    { key: "research", label: "Investigar y comparar", goal: "Compara tres herramientas de gestión de proyectos para un equipo pequeño: precios, ventajas y limitaciones. No crees cuentas ni te suscribas." },
    { key: "team-follow-up", label: "Seguimiento del equipo", goal: "Prepara el seguimiento de tres contactos esta semana. Prioriza los próximos pasos, pero no envíes mensajes." },
  ],
  fr: [
    { key: "project", label: "Planifier un projet", goal: "Planifiez le lancement d’un produit dans quatre semaines avec jalons, budget et liste de contrôle. N’effectuez aucun achat." },
    { key: "research", label: "Rechercher et comparer", goal: "Comparez trois outils de gestion de projet pour une petite équipe : prix, avantages et limites. Ne créez aucun compte et ne souscrivez à rien." },
    { key: "team-follow-up", label: "Suivi d’équipe", goal: "Préparez le suivi de trois prospects cette semaine. Priorisez les prochaines étapes, mais n’envoyez aucun message." },
  ],
  de: [
    { key: "project", label: "Projekt planen", goal: "Plane eine Produkteinführung in vier Wochen mit Meilensteinen, Budget und Checkliste. Tätige keine Käufe." },
    { key: "research", label: "Recherchieren und vergleichen", goal: "Vergleiche drei Projektmanagement-Tools für ein kleines Team nach Preis, Stärken und Grenzen. Erstelle keine Konten und schließe keine Abos ab." },
    { key: "team-follow-up", label: "Team-Follow-up", goal: "Bereite diese Woche die Nachverfolgung von drei Leads vor. Priorisiere nächste Schritte, aber sende keine Nachrichten." },
  ],
};

export function getMissionStarterExamples(language) {
  return MISSION_STARTER_EXAMPLES[language] || MISSION_STARTER_EXAMPLES.en;
}
