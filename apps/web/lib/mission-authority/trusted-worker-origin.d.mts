export interface TrustedWorkerOriginOptions {
  nodeEnv?: string;
  e2eRuntimeBaseUrl?: string;
  deployPrimeUrl?: string;
  deployUrl?: string;
  siteUrl?: string;
  publicSiteUrl?: string;
  requestUrl?: string;
}

export function resolveTrustedWorkerOrigin(
  options?: TrustedWorkerOriginOptions
): string | null;
