function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Chooses the canonical invitation URL for the current deployment context.
 *
 * Deploy Previews must stay on their preview permalink rather than sending
 * invitees to the production site. Production must prefer its explicit public
 * base URL or canonical site URL over the per-deploy permalink, which can
 * become stale or point at a deployment-specific hostname.
 */
export function resolveInvitationConfiguredUrl({
  context,
  pullRequest,
  deployPrimeUrl,
  explicitOrigin,
  siteUrl,
  publicSiteUrl,
} = {}) {
  const normalizedContext = clean(context).toLowerCase();
  const isDeployPreview = normalizedContext === "deploy-preview"
    || clean(pullRequest).toLowerCase() === "true";
  const deployOrigin = clean(deployPrimeUrl);
  const explicit = clean(explicitOrigin);
  const site = clean(siteUrl);
  const publicSite = clean(publicSiteUrl);

  if (isDeployPreview) {
    return deployOrigin || explicit;
  }

  if (normalizedContext === "production") {
    return explicit || site || publicSite || deployOrigin;
  }

  // Branch deploys need their own URL for invite acceptance; outside production
  // the deploy-specific URL is safer than blindly switching to the main site.
  return deployOrigin || explicit || site || publicSite;
}
