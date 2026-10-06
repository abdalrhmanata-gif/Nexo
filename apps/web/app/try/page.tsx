import { AnonymousPlanForm } from "../../components/anonymous-plan-form";
import { LocalizedText } from "../../components/localized-text";

export default function TryPage() {
  return <div className="container">
    <section className="hero">
      <p className="eyebrow"><LocalizedText en="No signup needed" nb="Ingen registrering nødvendig" ar="لا حاجة للتسجيل" /></p>
      <h1><LocalizedText en="See how ZAVQERA turns a goal into a practical plan." nb="Se hvordan ZAVQERA gjør et mål om til en praktisk plan." ar="شاهد كيف يحوّل ZAVQERA هدفك إلى خطة عملية." /></h1>
      <p><LocalizedText en="Try one AI plan first. Create an account only when you want to save and continue." nb="Prøv én AI-plan først. Opprett konto når du vil lagre og fortsette." ar="جرّب خطة واحدة أولًا. أنشئ حسابًا عندما تريد الحفظ والمتابعة." /></p>
    </section>
    <AnonymousPlanForm />
  </div>;
}
