"use server";

import { headers } from "next/headers";
import { signIn, signOut } from "@/auth";
import { clearFailures, clientIp, isBlocked, recordFailure, verifyAdmin } from "@/lib/login";

function safeRedirect(value) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

export async function login(_state, formData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = clientIp(await headers());

  if (await isBlocked(ip)) return { error: "Too many attempts. Try again in 15 minutes.", username };
  if (!verifyAdmin(username, password)) {
    await recordFailure(ip);
    return { error: "Username or password is incorrect.", username };
  }

  await clearFailures(ip);
  await signIn("credentials", { username, password, redirectTo: safeRedirect(formData.get("next")) });
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
