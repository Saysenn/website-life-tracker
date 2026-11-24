/**
 * Makes a new authenticator (2FA) secret.
 *
 *   npm run totp:setup            for the admin account
 *   npm run totp:setup -- files   for the file transfer account
 *
 * Add the printed secret to your authenticator app, then set ADMIN_TOTP_SECRET
 * (or FILES_TOTP_SECRET) in Vercel and redeploy. Sign in then asks for the code.
 */
import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const bytes = randomBytes(20);
let bits = 0;
let value = 0;
let secret = "";
for (const byte of bytes) {
  value = (value << 8) | byte;
  bits += 8;
  while (bits >= 5) {
    bits -= 5;
    secret += ALPHABET[(value >>> bits) & 31];
  }
  value &= (1 << bits) - 1;
}

const account = process.argv[2] === "files" ? "files" : "admin";
const variable = account === "files" ? "FILES_TOTP_SECRET" : "ADMIN_TOTP_SECRET";
const uri = `otpauth://totp/${encodeURIComponent(`Life Tracker:${account}`)}?secret=${secret}&issuer=${encodeURIComponent("Life Tracker")}&algorithm=SHA1&digits=6&period=30`;

console.log(`\n${variable}=${secret}\n`);
console.log("In your authenticator app choose \"Enter a setup key\" and paste the secret above,");
console.log("or turn this link into a QR code on a device you trust:\n");
console.log(`${uri}\n`);
console.log(`Then set ${variable} in Vercel (and .env.local) and redeploy. Keep the secret private.`);
