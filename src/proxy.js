import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const onLogin = pathname === "/login";

  if (request.auth) return onLogin ? NextResponse.redirect(new URL("/", request.nextUrl)) : NextResponse.next();
  if (onLogin) return NextResponse.next();

  const url = new URL("/login", request.nextUrl);
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
