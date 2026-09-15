import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { clientIp, isBlocked, recordFailure, verifyAdmin } from "./lib/login";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { username: {}, password: { type: "password" } },
      async authorize(credentials, request) {
        const ip = clientIp(request.headers);
        if (await isBlocked(ip)) return null;
        if (verifyAdmin(credentials?.username, credentials?.password)) return { id: "admin", name: "Admin" };
        await recordFailure(ip);
        return null;
      },
    }),
  ],
});
