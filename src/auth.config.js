/** Shared by the proxy and the server, so it only uses Web APIs. */

const ACCOUNT_ENV = {
  admin: ["ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_TOTP_SECRET"],
  files: ["FILES_USERNAME", "FILES_PASSWORD", "FILES_TOTP_SECRET"],
};

const fingerprints = new Map();

/**
 * A hash of the account's current username, password and 2FA secret. Every session
 * carries the one it signed in with, so changing any of them signs every device out.
 */
async function fingerprint(role) {
  const names = ACCOUNT_ENV[role];
  if (!names) return null;
  const source = [role, ...names.map((name) => process.env[name] ?? "")].join("\u0000");
  const known = fingerprints.get(role);
  if (known?.source === source) return known.value;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const value = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  fingerprints.set(role, { source, value });
  return value;
}

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.fp = await fingerprint(user.role);
        return token;
      }
      // Returning null ends the session: an unknown role, or credentials changed since sign in.
      const current = await fingerprint(token.role);
      return current && token.fp === current ? token : null;
    },
    session({ session, token }) {
      if (session.user) session.user.role = token.role;
      return session;
    },
  },
};
