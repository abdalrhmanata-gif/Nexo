// Official pages the guides cite. URLs only; each language names them in its
// own words (GuideChrome.sourceLabels). Every entry must be https and .gov.
export const SOURCE_URLS = {
  sbaGuide: "https://www.sba.gov/business-guide/10-steps-start-your-business",
  sbaPlan: "https://www.sba.gov/business-guide/plan-your-business/write-your-business-plan",
  sbaStructure: "https://www.sba.gov/business-guide/launch-your-business/choose-business-structure",
  sbaRegister: "https://www.sba.gov/business-guide/launch-your-business/register-your-business",
  sbaLicenses: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits",
  sbaBank: "https://www.sba.gov/business-guide/launch-your-business/open-business-bank-account",
  irsEin: "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number",
} as const;

export type SourceKey = keyof typeof SOURCE_URLS;
