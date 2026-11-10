import { NextResponse } from "next/server";
import { HttpError, readJson, route, setGuestCookie, visitorInfo } from "@/lib/transfer/access";
import { notifyAdmin } from "@/lib/transfer/notify";
import { linkMatches, purgeExpired, startChat } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  const { key, name } = await readJson(request);
  if (!(await linkMatches(key))) throw new HttpError(404, "This link is no longer active. Ask for a new one.");
  await purgeExpired();
  const { chat, token } = await startChat({ name, ...visitorInfo(request) });
  await setGuestCookie(chat, token);
  notifyAdmin({ type: "start", chat });
  return NextResponse.json({ id: chat.id });
});
