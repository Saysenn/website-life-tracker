import { DEFAULT_TLD } from "./constants";

export const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function suggestWebsite(name, tld = DEFAULT_TLD) {
  const slug = slugify(name);
  return slug ? `${slug}${tld}` : "";
}

export function replaceTld(website, tld) {
  const base = website.trim().split(".")[0];
  return base ? `${base}${tld}` : "";
}
