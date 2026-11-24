/**
 * Encrypts the rows already in the database (new rows are encrypted by the app on save).
 *
 *   npm run db:encrypt                    dry run: shows what would change, writes nothing
 *   npm run db:encrypt -- --apply         encrypts plain values, re-keys old ones
 *   npm run db:encrypt -- --decrypt --apply   undo: back to plain text, as the old code reads it
 *
 * Safe to run more than once. Uses the same env as the app (.env.local), so run it with
 * the SAME AUTH_SECRET / DATA_ENCRYPTION_KEY as production, and only after the
 * encryption code is deployed, or the live site will show encrypted text.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import nextEnv from "@next/env";
import { createClient } from "@libsql/client";

nextEnv.loadEnvConfig(process.cwd());

const { decryptText, encryptText, isEncrypted, needsRekey, openLegacySealed, sealLegacy } = await import("../src/db/cipher.js");
const { dbCredentials } = await import("../src/db/credentials.js");

/** Keep in step with the encryptedText(...) columns in src/db/schema.js. */
const ENCRYPTED = {
  groups: ["name"],
  companies: ["name", "website", "digirdp_email", "rdp_host", "rdp_username", "notes"],
  company_names: ["name"],
  settings: ["notify_email"],
  transfer_chats: ["name", "location", "user_agent"],
  transfer_files: ["name"],
};
/** Sealed by src/lib/vault.js. */
const VAULT = { companies: ["provider_password", "digirdp_password"] };

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const undo = args.has("--decrypt");

function field(value, vault) {
  if (value === null || value === undefined || value === "") return undefined;
  if (undo) {
    if (!isEncrypted(value)) return undefined;
    const plain = decryptText(value);
    return vault ? sealLegacy(plain) : plain;
  }
  if (isEncrypted(value)) return needsRekey(value) ? encryptText(decryptText(value)) : undefined;
  if (!vault) return encryptText(value);
  const plain = openLegacySealed(value);
  if (plain === undefined) throw new Error("a saved password could not be opened with the current keys");
  return encryptText(plain);
}

function verify(before, after, vault) {
  if (undo) return;
  const expected = isEncrypted(before) ? decryptText(before) : vault ? openLegacySealed(before) : before;
  if (decryptText(after) !== expected) throw new Error("round trip check failed");
}

const { url, authToken } = dbCredentials();
const client = createClient({ url, authToken });
console.log(`Database: ${url.startsWith("file:") ? url : new URL(url.replace(/^libsql:/, "https:")).host}`);
console.log(`Mode: ${undo ? "decrypt" : "encrypt"}${apply ? "" : " (dry run, nothing is written)"}\n`);

const backup = {};
const plan = [];
let total = 0;

for (const table of Object.keys({ ...ENCRYPTED, ...VAULT })) {
  const columns = [...(ENCRYPTED[table] ?? []).map((name) => [name, false]), ...(VAULT[table] ?? []).map((name) => [name, true])];
  const { rows } = await client.execute(`SELECT id, ${columns.map(([name]) => `"${name}"`).join(", ")} FROM "${table}"`);
  const counts = Object.fromEntries(columns.map(([name]) => [name, 0]));

  for (const row of rows) {
    const changes = {};
    for (const [name, vault] of columns) {
      let next;
      try {
        next = field(row[name], vault);
        if (next !== undefined) verify(row[name], next, vault);
      } catch (error) {
        console.error(`  ${table}#${row.id}.${name}: ${error.message}. Stopping, nothing was written.`);
        process.exit(1);
      }
      if (next === undefined) continue;
      changes[name] = next;
      counts[name] += 1;
    }
    if (!Object.keys(changes).length) continue;
    (backup[table] ??= []).push(Object.fromEntries([["id", row.id], ...Object.keys(changes).map((name) => [name, row[name]])]));
    const names = Object.keys(changes);
    plan.push({
      sql: `UPDATE "${table}" SET ${names.map((name) => `"${name}" = ?`).join(", ")} WHERE id = ?`,
      args: [...names.map((name) => changes[name]), row.id],
    });
  }

  const changed = Object.entries(counts).filter(([, count]) => count);
  total += changed.reduce((sum, [, count]) => sum + count, 0);
  console.log(`${table.padEnd(15)} ${rows.length} rows  ${changed.length ? changed.map(([name, count]) => `${name}: ${count}`).join(", ") : "nothing to do"}`);
}

if (!total) {
  console.log("\nEverything is already done.");
  process.exit(0);
}
if (!apply) {
  console.log(`\n${total} values would change. Run again with --apply to write them.`);
  process.exit(0);
}

// The original values, in case anything needs undoing. Plain text inside: delete it once you have checked the site.
mkdirSync("backups", { recursive: true });
const file = `backups/before-${undo ? "decrypt" : "encrypt"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify(backup, null, 2), { mode: 0o600 });
chmodSync(file, 0o600);
console.log(`\nBackup of the original values: ${file}`);

for (let start = 0; start < plan.length; start += 100) {
  await client.batch(plan.slice(start, start + 100), "write");
}
console.log(`Done: ${total} values ${undo ? "decrypted" : "encrypted"}.`);
