"use server";

import { headers } from "next/headers";
import { auth, signIn, signOut } from "@/auth";
import { FILES_HOME, FILES_ROLE, clearFailures, clientIp, isBlocked, recordFailure, verifyLogin } from "@/lib/login";

function safeRedirect(value) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

async function attempt(formData, allowed) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = clientIp(await headers());

  if (await isBlocked(ip)) return { error: "Too many attempts. Try again in 15 minutes.", username };
  const role = verifyLogin(username, password);
  if (!role || !allowed.includes(role)) {
    await recordFailure(ip);
    return { error: "Username or password is incorrect.", username };
  }

  await clearFailures(ip);
  const redirectTo = role === FILES_ROLE ? FILES_HOME : safeRedirect(formData.get("next"));
  await signIn("credentials", { username, password, redirectTo });
}

export async function login(_state, formData) {
  return attempt(formData, ["admin", FILES_ROLE]);
}

/** The public /files login only lets the file transfer account in, never the admin. */
export async function loginFiles(_state, formData) {
  return attempt(formData, [FILES_ROLE]);
}

export async function logout() {
  const role = (await auth())?.user?.role;
  await signOut({ redirectTo: role === FILES_ROLE ? "/files" : "/login" });
}
