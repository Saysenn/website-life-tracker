"use server";

import { headers } from "next/headers";
import { signIn, signOut } from "@/auth";
import { FILES_HOME, FILES_ROLE, clearFailures, clientIp, isBlocked, recordFailure, verifyLogin } from "@/lib/login";

function safeRedirect(value) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

export async function login(_state, formData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = clientIp(await headers());

  if (await isBlocked(ip)) return { error: "Too many attempts. Try again in 15 minutes.", username };
  const role = verifyLogin(username, password);
  if (!role) {
    await recordFailure(ip);
    return { error: "Username or password is incorrect.", username };
  }

  await clearFailures(ip);
  const redirectTo = role === FILES_ROLE ? FILES_HOME : safeRedirect(formData.get("next"));
  await signIn("credentials", { username, password, redirectTo });
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
