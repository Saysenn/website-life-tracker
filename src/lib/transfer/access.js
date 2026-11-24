import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { transferChats } from "@/db/schema";
import { clientIp } from "@/lib/login";
import { autoDeleteOn, expiryOf } from "./settings";
import { hashToken, sameText } from "./crypto";

export const GUEST_COOKIE = "ft_guest";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Wraps a route handler so thrown HttpErrors become JSON responses. */
export function route(handler) {
  return async (request, context) => {
    try {
      if (request.method !== "GET") checkOrigin(request);
      return await handler(request, context);
    } catch (error) {
      if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
      console.error("File transfer error", error);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }
  };
}

/** Mutating calls need our custom header (forces a CORS preflight) and a same origin. */
function checkOrigin(request) {
  if (request.headers.get("x-transfer") !== "1") throw new HttpError(403, "Request blocked.");
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) throw new HttpError(403, "Request blocked.");
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}

/** The admin, or the file transfer account, which works the transfer as the admin. */
export async function isAdminRequest() {
  const role = (await auth())?.user?.role;
  return role === "admin" || role === "files";
}

export async function requireAdmin() {
  if (!(await isAdminRequest())) throw new HttpError(401, "Your session expired. Sign in again.");
}

export async function guestChat() {
  const raw = (await cookies()).get(GUEST_COOKIE)?.value ?? "";
  const [chatId, token] = raw.split(".");
  if (!chatId || !token) return null;
  const chat = await db.query.transferChats.findFirst({ where: eq(transferChats.id, chatId) });
  if (!chat || chat.deletedAt || !sameText(chat.tokenHash, hashToken(token))) return null;
  const expires = expiryOf(chat.createdAt, await autoDeleteOn());
  if (expires && expires < Date.now()) return null;
  return chat;
}

export async function requireGuest() {
  const chat = await guestChat();
  if (!chat) throw new HttpError(401, "This chat has ended. Open the link again to start a new one.");
  return chat;
}

/** A guest cookie lasts as long as the chat; maxDays caps it (your own chat on a borrowed phone). */
export async function setGuestCookie(chat, token, { maxDays = 400 } = {}) {
  const cap = Date.now() + maxDays * 24 * 60 * 60 * 1000;
  const expires = Math.min(expiryOf(chat.createdAt, await autoDeleteOn()) ?? cap, cap);
  (await cookies()).set(GUEST_COOKIE, `${chat.id}.${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(expires),
  });
}

export async function clearGuestCookie() {
  (await cookies()).delete(GUEST_COOKIE);
}

export function visitorInfo(request) {
  const headers = request.headers;
  const decode = (value) => {
    try {
      return value ? decodeURIComponent(value) : "";
    } catch {
      return value;
    }
  };
  const location = [decode(headers.get("x-vercel-ip-city")), headers.get("x-vercel-ip-country-region"), headers.get("x-vercel-ip-country")]
    .filter(Boolean)
    .join(", ");
  return {
    ip: clientIp(headers),
    location: location || null,
    userAgent: headers.get("user-agent")?.slice(0, 300) || null,
  };
}
