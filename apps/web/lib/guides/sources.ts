// Official pages the guides cite. URLs only; each language names them in its
// own words (GuideChrome.sourceLabels). Every entry must be https and either a
// US .gov site or one of the official hosts in OFFICIAL_HOSTS.
export const SOURCE_URLS = {
  sbaGuide: "https://www.sba.gov/business-guide/10-steps-start-your-business",
  sbaPlan: "https://www.sba.gov/business-guide/plan-your-business/write-your-business-plan",
  sbaStructure: "https://www.sba.gov/business-guide/launch-your-business/choose-business-structure",
  sbaRegister: "https://www.sba.gov/business-guide/launch-your-business/register-your-business",
  sbaLicenses: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits",
  sbaBank: "https://www.sba.gov/business-guide/launch-your-business/open-business-bank-account",
  irsEin: "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number",
  // Germany, checked 2026-11-24.
  deLandlord: "https://www.gesetze-im-internet.de/bmg/__19.html",
  deRegistration: "https://www.gesetze-im-internet.de/bmg/__17.html",
  deFines: "https://www.gesetze-im-internet.de/bmg/__54.html",
  deResidence: "https://www.make-it-in-germany.com/en/visa-residence/procedure/entry-process",
  deHealth: "https://gesund.bund.de/krankenversicherung",
  deBank: "https://www.bafin.de/DE/Verbraucher/Bank/Produkte/Basiskonto/basiskonto_node.html",
  deTaxId: "https://verwaltung.bund.de/leistungsverzeichnis/DE/leistung/99102044101000/herausgeber/LeiKa-102730390/region/000000000000",
  deBroadcast: "https://www.rundfunkbeitrag.de/buergerinnen_und_buerger/formulare/anmelden/index_ger.html",
  deIntegration: "https://www.bamf.de/DE/Themen/Integration/ZugewanderteTeilnehmende/Integrationskurse/integrationskurse-node.html",
  deDriving: "https://www.gesetze-im-internet.de/fev_2010/__29.html",
  // United Kingdom, checked 2026-11-24: GOV.UK and the NHS website.
  ukEvisa: "https://www.gov.uk/evisa",
  ukRent: "https://www.gov.uk/prove-right-to-rent",
  ukCouncilTax: "https://www.gov.uk/council-tax/who-has-to-pay",
  ukGp: "https://www.nhs.uk/nhs-services/gps/how-to-register-with-a-gp-surgery/",
  ukNino: "https://www.gov.uk/apply-national-insurance-number",
  ukBank: "https://www.gov.uk/government/collections/basic-bank-accounts",
  ukTaxCode: "https://www.gov.uk/tax-codes",
  ukTvLicence: "https://www.gov.uk/tv-licence",
  ukDriving: "https://www.gov.uk/driving-nongb-licence",
} as const;

/**
 * Non-US official hosts the guides may cite. Germany: federal law (Federal
 * Ministry of Justice), the federal portals, the federal skilled-immigration
 * portal, BaFin, BAMF and the public broadcasting contribution service.
 * United Kingdom: GOV.UK and the NHS website. Anything else is not an
 * official source.
 */
export const OFFICIAL_HOSTS = [
  "www.gesetze-im-internet.de",
  "www.make-it-in-germany.com",
  "gesund.bund.de",
  "verwaltung.bund.de",
  "www.bafin.de",
  "www.bamf.de",
  "www.rundfunkbeitrag.de",
  "www.gov.uk",
  "www.nhs.uk",
] as const;

export type SourceKey = keyof typeof SOURCE_URLS;
