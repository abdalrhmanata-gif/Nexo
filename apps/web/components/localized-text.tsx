"use client";

import { useEffect, useState } from "react";
import type { AppLanguage } from "./language-switcher";

const TEXTS: Record<AppLanguage, Record<string, string>> = {
  en: {},
  nb: {
    "Mission control for autonomous AI": "Kontrollsenter for autonom KI",
    "Keep intent clear. Keep authority bounded.": "Hold målet tydelig. Hold myndigheten avgrenset.",
    "ZAVQERA gives teams a quiet, legible place to shape long-running AI work and see what is happening before it becomes action.": "ZAVQERA gir team et oversiktlig sted for å planlegge langsiktig KI-arbeid og se hva som skjer før det blir til handling.",
    "Open workspace": "Åpne arbeidsområdet",
    "MISSION CONTROL": "KONTROLLSENTER",
    "Workspace": "Arbeidsområde",
    "New mission": "Nytt oppdrag",
    "A calm control plane for bounded AI work.": "Et oversiktlig kontrollsenter for avgrenset KI-arbeid.",
    "Welcome back": "Velkommen tilbake",
    "Sign in.": "Logg inn.",
    "Access your workspace and keep authority bounded.": "Åpne arbeidsområdet ditt og behold kontrollen.",
    "Forgot your password?": "Glemt passordet?",
    "Need an account?": "Trenger du en konto?",
    "Create one": "Opprett konto",
    "Get started": "Kom i gang",
    "Create your account.": "Opprett kontoen din.",
    "Your workspace and missions are private to you.": "Arbeidsområdet og oppdragene dine er private.",
    "Already have an account?": "Har du allerede en konto?",
    "Sign in": "Logg inn",
    "Account recovery": "Kontogjenoppretting",
    "Reset your password.": "Tilbakestill passordet.",
    "We'll email you a secure link to choose a new password.": "Vi sender deg en sikker lenke for å velge et nytt passord.",
    "Back to sign in": "Tilbake til innlogging",
    "Choose a new password.": "Velg et nytt passord.",
    "Use a password you haven't used elsewhere.": "Bruk et passord du ikke bruker andre steder.",
    "Request a new reset link": "Be om en ny tilbakestillingslenke",
    "Loading sign-in…": "Laster innlogging…",
    "Loading sign-up…": "Laster registrering…",
    "Loading password reset…": "Laster passordtilbakestilling…"
  },
  ar: {
    "Mission control for autonomous AI": "مركز التحكم بالذكاء الاصطناعي المستقل",
    "Keep intent clear. Keep authority bounded.": "حافظ على وضوح الهدف وحدود الصلاحيات.",
    "ZAVQERA gives teams a quiet, legible place to shape long-running AI work and see what is happening before it becomes action.": "يوفر ZAVQERA مساحة واضحة لتنظيم مهام الذكاء الاصطناعي ومتابعتها قبل تحويلها إلى إجراءات.",
    "Open workspace": "افتح مساحة العمل",
    "MISSION CONTROL": "مركز التحكم",
    "Workspace": "مساحة العمل",
    "New mission": "مهمة جديدة",
    "A calm control plane for bounded AI work.": "منصة واضحة لإدارة مهام الذكاء الاصطناعي ضمن صلاحيات محددة.",
    "Welcome back": "مرحبًا بعودتك",
    "Sign in.": "تسجيل الدخول",
    "Access your workspace and keep authority bounded.": "ادخل إلى مساحة عملك مع الحفاظ على حدود الصلاحيات.",
    "Forgot your password?": "هل نسيت كلمة المرور؟",
    "Need an account?": "ليس لديك حساب؟",
    "Create one": "أنشئ حسابًا",
    "Get started": "ابدأ الآن",
    "Create your account.": "أنشئ حسابك",
    "Your workspace and missions are private to you.": "مساحة عملك ومهامك خاصة بك.",
    "Already have an account?": "لديك حساب بالفعل؟",
    "Sign in": "تسجيل الدخول",
    "Account recovery": "استعادة الحساب",
    "Reset your password.": "إعادة تعيين كلمة المرور",
    "We'll email you a secure link to choose a new password.": "سنرسل إلى بريدك رابطًا آمنًا لاختيار كلمة مرور جديدة.",
    "Back to sign in": "العودة إلى تسجيل الدخول",
    "Choose a new password.": "اختر كلمة مرور جديدة",
    "Use a password you haven't used elsewhere.": "استخدم كلمة مرور لا تستعملها في مواقع أخرى.",
    "Request a new reset link": "طلب رابط إعادة تعيين جديد",
    "Loading sign-in…": "جارٍ تحميل تسجيل الدخول…",
    "Loading sign-up…": "جارٍ تحميل إنشاء الحساب…",
    "Loading password reset…": "جارٍ تحميل إعادة تعيين كلمة المرور…"
  }
};

export function LocalizedText({ en, nb, ar }: { en: string; nb?: string; ar?: string }) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    const saved = window.localStorage.getItem("zavqera-language");
    const cookie = document.cookie.split("; ").find((part) => part.startsWith("zavqera-language="))?.split("=")[1];
    const candidate = saved || cookie || navigator.language.toLowerCase().split("-")[0];
    const next: AppLanguage = candidate === "ar" || candidate === "nb" ? candidate : "en";
    setLanguage(next);
  }, []);
  const source = en;
  return <>{language === "ar" ? (ar ?? TEXTS.ar[source] ?? en) : language === "nb" ? (nb ?? TEXTS.nb[source] ?? en) : en}</>;
}
