import assert from "node:assert/strict";
import test from "node:test";
import { resolveInvitationConfiguredUrl } from "../lib/invitation-origin.mjs";

test("Deploy Previews always prefer the matching preview URL over production site URLs", () => {
  assert.equal(resolveInvitationConfiguredUrl({
    context: "deploy-preview",
    pullRequest: "true",
    deployPrimeUrl: "https://deploy-preview-29--zavqera.netlify.app",
    explicitOrigin: "https://zavqera.example",
    siteUrl: "https://zavqera.netlify.app",
    publicSiteUrl: "https://zavqera.example",
  }), "https://deploy-preview-29--zavqera.netlify.app");
});

test("preview deployments without a Netlify permalink use the explicit preview override", () => {
  assert.equal(resolveInvitationConfiguredUrl({
    context: "deploy-preview",
    explicitOrigin: "https://feature-preview.example",
    siteUrl: "https://zavqera.netlify.app",
    publicSiteUrl: "https://zavqera.example",
  }), "https://feature-preview.example");
});

test("production prefers the canonical site URL over a per-deploy permalink", () => {
  assert.equal(resolveInvitationConfiguredUrl({
    context: "production",
    deployPrimeUrl: "https://123abc--zavqera.netlify.app",
    siteUrl: "https://zavqera.netlify.app",
    publicSiteUrl: "https://www.zavqera.example",
  }), "https://zavqera.netlify.app");
});

test("production honours an explicitly configured public invitation base URL", () => {
  assert.equal(resolveInvitationConfiguredUrl({
    context: "production",
    deployPrimeUrl: "https://123abc--zavqera.netlify.app",
    explicitOrigin: "https://www.zavqera.example",
    siteUrl: "https://zavqera.netlify.app",
  }), "https://www.zavqera.example");
});

test("production can use the configured public site URL if Netlify URL is missing", () => {
  assert.equal(resolveInvitationConfiguredUrl({
    context: "production",
    deployPrimeUrl: "https://123abc--zavqera.netlify.app",
    publicSiteUrl: "https://www.zavqera.example",
  }), "https://www.zavqera.example");
});

test("branch deployments prefer their own deployment URL", () => {
  assert.equal(resolveInvitationConfiguredUrl({
    context: "branch-deploy",
    deployPrimeUrl: "https://feature--zavqera.netlify.app",
    siteUrl: "https://zavqera.netlify.app",
  }), "https://feature--zavqera.netlify.app");
});

test("blank environment values are ignored", () => {
  assert.equal(resolveInvitationConfiguredUrl({
    context: "production",
    deployPrimeUrl: " ",
    explicitOrigin: "",
    siteUrl: " ",
    publicSiteUrl: "https://www.zavqera.example",
  }), "https://www.zavqera.example");
});
