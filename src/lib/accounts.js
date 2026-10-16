const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LABEL = /^(user(name)?|email|login|account|pass(word)?|pw)\s*[:=]\s*/i;

export const normalizeName = (value) =>
  value
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/\b(ltd|limited|inc|llc|co)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const clean = (line) => line.replace(LABEL, "").trim();

const isHeading = (line) => line === line.toUpperCase() && line.split(/\s+/).length <= 3 && !EMAIL.test(line);

function parseBlock(lines) {
  const [first, ...rest] = lines;
  const account = rest.find((line) => EMAIL.test(line)) ?? "";
  const others = rest.filter((line) => line !== account);
  return { name: first, account, password: others[others.length - 1] ?? "" };
}

export function parseAccounts(text, groups = []) {
  const known = new Map(groups.map((group) => [normalizeName(group), group]));
  const blocks = text
    .split(/\r?\n\s*\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .map((line) => clean(line))
        .filter(Boolean),
    )
    .filter((lines) => lines.length);

  const rows = [];
  let group = "";

  for (const lines of blocks) {
    let body = lines;
    const heading = known.get(normalizeName(lines[0]));

    if (heading || isHeading(lines[0])) {
      group = heading ?? lines[0];
      body = lines.slice(1);
    }
    if (!body.length) continue;

    rows.push({ ...parseBlock(body), group, raw: lines.join("\n") });
  }

  const seen = new Map();
  for (const row of rows) {
    const key = normalizeName(row.name);
    if (seen.has(key)) row.duplicateOf = seen.get(key).name;
    else seen.set(key, row);
  }

  return rows;
}

export function matchExisting(rows, companies) {
  const byName = new Map(companies.map((company) => [normalizeName(company.name), company]));
  return rows.map((row) => {
    const existing = byName.get(normalizeName(row.name));
    return { ...row, existingId: existing?.id ?? null, existingGroup: existing?.groupName ?? null };
  });
}
