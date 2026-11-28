// Tall images (1000x1500) of the free checklists, for Pinterest.
// Made by tool/pins/make_pins.py into public/pins/<lang>/<slug>.png.
import { checklistBySlug, checklistLanguage, checklistPath } from "./checklists.mjs";

const SITE = "https://zavqera.com";

/** Path of the checklist's pin image, or null for an unknown slug. */
export function checklistPinPath(slug) {
  const checklist = checklistBySlug(slug);
  if (!checklist) return null;
  return `/pins/${checklistLanguage(checklist)}/${checklist.slug}.png`;
}

/** Pinterest's own "save" page, filled with this checklist's image, page and title. */
export function checklistPinterestUrl(slug) {
  const checklist = checklistBySlug(slug);
  if (!checklist) return null;
  const params = new URLSearchParams({
    url: `${SITE}${checklistPath(checklist.slug)}?utm_source=pinterest&utm_medium=social`,
    media: `${SITE}${checklistPinPath(checklist.slug)}`,
    description: checklist.metaTitle,
  });
  return `https://www.pinterest.com/pin/create/button/?${params}`;
}
