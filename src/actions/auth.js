"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import { FILES_HOME, FILES_ROLE, clearFailures, clientIp, isBlocked, recordFailure, verifyLogin } from "@/lib/login";
import { clearGuestCookie, setGuestCookie, visitorInfo } from "@/lib/transfer/access";
import { openSelfChat, purgeExpired } from "@/lib/transfer/store";

const SELF_PAGE = "/me";
/** A sign in on someone else's phone should not last forever. */
const SELF_DAYS = 30;

function safeRedirect(value) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

/** Checks the form against the accounts in `allowed`. Returns { role } or { error }. */
async function check(formData, allowed) {
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
  return { role, username, password };
}

async function attempt(formData, allowed) {
  const result = await check(formData, allowed);
  if (result.error) return result;
  const { role, username, password } = result;
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

/**
 * /me: signs you into your own chat on this device only. It never starts an app
 * session, so a borrowed phone can send to the admin and read the replies, nothing else.
 */
export async function loginSelf(_state, formData) {
  const result = await check(formData, ["admin", FILES_ROLE]);
  if (result.error) return result;
  await purgeExpired();
  const { chat, token } = await openSelfChat(visitorInfo({ headers: await headers() }));
  await setGuestCookie(chat, token, { maxDays: SELF_DAYS });
  redirect(SELF_PAGE);
}

export async function logoutSelf() {
  await clearGuestCookie();
  redirect(SELF_PAGE);
}
