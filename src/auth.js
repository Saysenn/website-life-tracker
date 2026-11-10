import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { clientIp, isBlocked, recordFailure, verifyLogin } from "./lib/login";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { username: {}, password: { type: "password" } },
      async authorize(credentials, request) {
        const ip = clientIp(request.headers);
        if (await isBlocked(ip)) return null;
        const role = verifyLogin(credentials?.username, credentials?.password);
        if (role === "admin") return { id: "admin", name: "Admin", role };
        if (role) return { id: role, name: "File transfer", role };
        await recordFailure(ip);
        return null;
      },
    }),
  ],
});
