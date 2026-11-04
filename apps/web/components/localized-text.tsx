"use client";

import { useEffect, useState } from "react";
import type { AppLanguage } from "./language-switcher";

const NB: Record<string, string> = {
  "MISSION CONTROL":"KONTROLLSENTER", "Search":"Søk", "New mission":"Nytt oppdrag",
  "Business":"Bedrift", "Templates":"Maler", "Pricing":"Priser", "Workspace":"Arbeidsområde",
  "Opportunity Intelligence":"Mulighetsanalyse", "Notifications":"Varsler", "Sign out":"Logg ut",
  "A calm control plane for bounded AI work.":"Et oversiktlig kontrollsenter for avgrenset KI-arbeid.",
  "Business workspace":"Arbeidsområde for bedrifter", "Run AI work with clear boundaries.":"Organiser KI-arbeid med tydelige rammer.",
  "Total missions":"Oppdrag totalt", "Active":"Aktive", "Completed":"Fullførte", "Needs your input":"Trenger avklaring",
  "Invite a teammate":"Inviter en kollega", "Invitations not enabled":"Invitasjoner er ikke aktivert",
  "Recent missions":"Nylige oppdrag", "Open workspace":"Åpne arbeidsområdet",
  "Workspace updates":"Oppdateringer", "need attention":"krever oppmerksomhet", "Your input":"Din avklaring",
  "Missions waiting for you":"Oppdrag som venter på deg", "Review mission":"Gjennomgå oppdrag",
  "No missions are waiting for your input.":"Ingen oppdrag venter på avklaring.", "Follow-up":"Oppfølging",
  "Due and overdue tasks":"Oppgaver som forfaller", "Overdue":"Forfalt", "Due within 7 days":"Innen 7 dager",
  "Open task":"Åpne oppgave", "Back to workspace":"Tilbake til arbeidsområdet",
  "Mission templates":"Oppdragsmaler", "Start with a useful first plan.":"Start med en nyttig første plan.",
  "Use this template":"Bruk denne malen", "Mission template":"Oppdragsmal",
  "Find a mission":"Finn et oppdrag", "Search your missions":"Søk i oppdragene dine",
  "Find by mission name, goal, success criterion, or step.":"Søk etter navn, mål, suksesskriterium eller steg.",
  "Search missions":"Søk i oppdrag", "Clear":"Tøm"
};
const AR: Record<string, string> = {
  "MISSION CONTROL":"مركز التحكم", "Search":"بحث", "New mission":"مهمة جديدة",
  "Business":"الأعمال", "Templates":"القوالب", "Pricing":"الأسعار", "Workspace":"مساحة العمل",
  "Opportunity Intelligence":"تحليل الفرص", "Notifications":"الإشعارات", "Sign out":"تسجيل الخروج",
  "A calm control plane for bounded AI work.":"مركز تحكم واضح للعمل بالذكاء الاصطناعي ضمن حدود محددة.",
  "Business workspace":"مساحة عمل الشركات", "Run AI work with clear boundaries.":"أدر عمل الذكاء الاصطناعي ضمن حدود واضحة.",
  "Total missions":"إجمالي المهام", "Active":"نشطة", "Completed":"مكتملة", "Needs your input":"تحتاج تدخلك",
  "Invite a teammate":"دعوة زميل إلى الفريق", "Invitations not enabled":"الدعوات غير مفعّلة",
  "Recent missions":"المهام الأخيرة", "Open workspace":"افتح مساحة العمل",
  "Workspace updates":"تحديثات مساحة العمل", "need attention":"تحتاج إلى اهتمام", "Your input":"مطلوب منك",
  "Missions waiting for you":"مهام بانتظارك", "Review mission":"راجع المهمة",
  "No missions are waiting for your input.":"لا توجد مهام تنتظر توجيهك.", "Follow-up":"المتابعة",
  "Due and overdue tasks":"المهام المستحقة والمتأخرة", "Overdue":"متأخرة", "Due within 7 days":"خلال 7 أيام",
  "Open task":"افتح المهمة", "Back to workspace":"العودة إلى مساحة العمل",
  "Mission templates":"قوالب المهام", "Start with a useful first plan.":"ابدأ بخطة أولية مفيدة.",
  "Use this template":"استخدم هذا القالب", "Mission template":"قالب مهمة",
  "Find a mission":"ابحث عن مهمة", "Search your missions":"ابحث في مهامك",
  "Find by mission name, goal, success criterion, or step.":"ابحث باسم المهمة أو الهدف أو معيار النجاح أو الخطوة.",
  "Search missions":"ابحث في المهام", "Clear":"مسح"
};
const ES: Record<string, string> = {
  "Search":"Buscar", "New mission":"Nueva misión", "Business":"Empresa", "Templates":"Plantillas",
  "Pricing":"Precios", "Workspace":"Espacio de trabajo", "Opportunity Intelligence":"Inteligencia de oportunidades",
  "Notifications":"Notificaciones", "Sign out":"Cerrar sesión", "Invite a teammate":"Invitar a un compañero",
};
const FR: Record<string, string> = {
  "Search":"Rechercher", "New mission":"Nouvelle mission", "Business":"Entreprise", "Templates":"Modèles",
  "Pricing":"Tarifs", "Workspace":"Espace de travail", "Opportunity Intelligence":"Analyse des opportunités",
  "Notifications":"Notifications", "Sign out":"Se déconnecter", "Invite a teammate":"Inviter un collègue",
};
const DE: Record<string, string> = {
  "Search":"Suchen", "New mission":"Neue Mission", "Business":"Unternehmen", "Templates":"Vorlagen",
  "Pricing":"Preise", "Workspace":"Arbeitsbereich", "Opportunity Intelligence":"Chancenanalyse",
  "Notifications":"Benachrichtigungen", "Sign out":"Abmelden", "Invite a teammate":"Teammitglied einladen",
};

export function LocalizedText({ en, nb, ar }: { en: string; nb?: string; ar?: string }) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem("zavqera-language"); } catch { /* storage may be blocked */ }
    const cookie = document.cookie.split("; ").find((part) => part.startsWith("zavqera-language="))?.split("=")[1];
    const candidate = saved || cookie || navigator.language.toLowerCase().split("-")[0];
    const supported: AppLanguage[] = ["en", "nb", "ar", "es", "fr", "de"];
    setLanguage(supported.includes(candidate as AppLanguage) ? candidate as AppLanguage : "en");
    const onLanguageChange = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      setLanguage(supported.includes(value as AppLanguage) ? value as AppLanguage : "en");
    };
    window.addEventListener("zavqera-language-change", onLanguageChange);
    return () => window.removeEventListener("zavqera-language-change", onLanguageChange);
  }, []);
  const dictionaries: Record<AppLanguage, Record<string, string>> = { en: {}, nb: NB, ar: AR, es: ES, fr: FR, de: DE };
  const languageText = language === "nb" ? (nb ?? NB[en]) : language === "ar" ? (ar ?? AR[en]) : dictionaries[language][en];
  return <>{languageText ?? en}</>;
}
