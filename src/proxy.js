import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

const FILES_HOME = "/tools/file-transfer";
/** Pages the file transfer account may open. */
const FILES_PAGES = new Set([FILES_HOME, "/tools/metadata-cleaner"]);
const FILES_LOGIN = "/files";
/** Open from any device even with the device lock on. */
const OPEN_PAGES = new Set(["/", "/login"]);
const DEVICE_COOKIE = "lt_device";
const DEVICE_MAX_AGE = 400 * 24 * 60 * 60;

/** Reachable from any device: file transfer guests, the token guarded agent API and the cron. */
const PUBLIC = [/^\/send\//, /^\/api\/(mcp|cleaner)(\/[^/]+)?$/, /^\/api\/transfer\/(guest|files)\//, /^\/api\/cron\//];

/** Checked by their own route handlers, so they skip the login redirect. */
const SELF_GUARDED = [/^\/api\/auth\//, /^\/api\/transfer\//];

let expectedDevice;

async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** With DEVICE_KEY unset the lock is off, so a missing variable never locks you out. */
async function deviceDigest() {
  const key = process.env.DEVICE_KEY?.trim();
  if (!key) return null;
  expectedDevice ??= await sha256(key);
  return expectedDevice;
}

const notFound = () =>
  new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });

async function unlock(request, expected) {
  const key = decodeURIComponent(request.nextUrl.pathname.slice("/unlock/".length));
  if (!expected || !key || (await sha256(key)) !== expected) return notFound();
  const response = NextResponse.redirect(new URL("/login", request.nextUrl));
  response.cookies.set(DEVICE_COOKIE, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_MAX_AGE,
  });
  return response;
}

const guarded = auth(async (request) => {
  const { pathname, search } = request.nextUrl;
  const expected = await deviceDigest();
  if (pathname.startsWith("/unlock/")) return unlock(request, expected);

  // The file transfer account has its own login and pages, open from any device.
  const role = request.auth?.user?.role;
  if (role === "files") {
    const allowed = FILES_PAGES.has(pathname) || pathname.startsWith("/api/transfer/");
    return allowed ? NextResponse.next() : NextResponse.redirect(new URL(FILES_HOME, request.nextUrl));
  }
  if (pathname === FILES_LOGIN) {
    return role ? NextResponse.redirect(new URL("/", request.nextUrl)) : NextResponse.next();
  }

  // The home page, the admin login and a signed in admin work from any device.
  // Anything else only answers on an unlocked device.
  const unlocked =
    !expected ||
    request.cookies.get(DEVICE_COOKIE)?.value === expected ||
    Boolean(request.auth) ||
    OPEN_PAGES.has(pathname) ||
    pathname.startsWith("/api/auth/");
  if (!unlocked) return notFound();

  if (SELF_GUARDED.some((pattern) => pattern.test(pathname))) return NextResponse.next();

  const onLogin = pathname === "/login";
  if (request.auth) return onLogin ? NextResponse.redirect(new URL("/", request.nextUrl)) : NextResponse.next();
  if (onLogin) return NextResponse.next();

  const url = new URL("/login", request.nextUrl);
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
});

export default function proxy(request, event) {
  if (PUBLIC.some((pattern) => pattern.test(request.nextUrl.pathname))) return NextResponse.next();
  return guarded(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
