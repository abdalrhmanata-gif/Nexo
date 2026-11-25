#!/usr/bin/env node
// Tells IndexNow (Bing, which ChatGPT search reads, plus Yandex, Naver, Seznam
// and others) which public pages of zavqera.com changed, so they are fetched
// again within hours instead of weeks.
//
// IndexNow asks for changed URLs only. This reads every page in the sitemap,
// keeps a hash of what a reader sees (title, description and visible text,
// never the build's file names), and sends only the pages whose hash differs
// from the last successful run. The first run sends them all.
//
// The key is public by design: it is served at https://zavqera.com/<key>.txt
// so IndexNow can check that the submitter controls the site. It is not a
// secret and grants nothing else.
//
// Usage: node tool/indexnow.mjs [state-file]   (INDEXNOW_DRY_RUN=1 to only report)

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const HOST = "zavqera.com";
export const SITE = `https://${HOST}`;
export const KEY = "f64d2f7a47a8635478f43df1b10bfa18";
export const KEY_LOCATION = `${SITE}/${KEY}.txt`;
export const ENDPOINT = "https://api.indexnow.org/indexnow";

/** The <loc> entries of a sitemap, on this site only. */
export function sitemapUrls(xml) {
  return [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .filter((url) => url === SITE || url.startsWith(`${SITE}/`));
}

/** What a reader sees: title, description and text, without scripts, styles or markup. */
export function pageText(html) {
  const source = String(html);
  const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const description = source.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] ?? "";
  const body = source
    .replace(/<head[\s\S]*?<\/head>/i, " ")
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;/g, "'");
  return `${title}\n${description}\n${body}`.replace(/\s+/g, " ").trim();
}

export function textHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** URLs whose hash is new or different. A page that could not be read is left out. */
export function changedUrls(previous, current) {
  return Object.keys(current).filter((url) => current[url] && previous[url] !== current[url]);
}

/** The body IndexNow expects; at most 10,000 URLs per request. */
export function submission(urls) {
  return { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls.slice(0, 10000) };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "zavqera-indexnow/1.0 (+https://zavqera.com)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

async function main() {
  const statePath = process.argv[2] ?? ".indexnow-state.json";
  const dryRun = process.env.INDEXNOW_DRY_RUN === "1";
  const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};

  const keyFile = (await fetchText(KEY_LOCATION)).trim();
  if (keyFile !== KEY) throw new Error(`${KEY_LOCATION} does not hold the key; IndexNow would refuse the submission.`);

  const urls = sitemapUrls(await fetchText(`${SITE}/sitemap.xml`));
  if (!urls.length) throw new Error("The sitemap lists no pages.");

  const current = {};
  for (const url of urls) {
    try {
      current[url] = textHash(pageText(await fetchText(url)));
    } catch (error) {
      console.warn(`skipped: ${error.message}`);
      if (previous[url]) current[url] = previous[url];
    }
  }

  const changed = changedUrls(previous, current);
  console.log(`${urls.length} pages in the sitemap, ${changed.length} new or changed since the last run.`);
  for (const url of changed) console.log(`  ${url}`);
  if (!changed.length || dryRun) {
    if (!dryRun) writeFileSync(statePath, JSON.stringify(current, null, 2));
    return;
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(submission(changed)),
    signal: AbortSignal.timeout(20000),
  });
  // 200 and 202 both mean accepted. Anything else keeps the old state, so the
  // same pages are sent again on the next run.
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  writeFileSync(statePath, JSON.stringify(current, null, 2));
  console.log(`IndexNow accepted ${changed.length} URL(s) (HTTP ${response.status}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
