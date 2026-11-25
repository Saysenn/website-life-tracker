import { NextResponse } from "next/server";
import { readJson, requireGuest, route } from "@/lib/transfer/access";
import { notifyAdmin } from "@/lib/transfer/notify";
import { postMessage, unsendMessage, unsendMessages } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  const chat = await requireGuest();
  const { body } = await readJson(request);
  const message = await postMessage(chat, "guest", body);
  notifyAdmin({ type: "message", chat });
  return NextResponse.json(message);
});

export const DELETE = route(async (request) => {
  const chat = await requireGuest();
  const { id, ids } = await readJson(request);
  if (ids) return NextResponse.json({ removed: await unsendMessages(chat, "guest", ids) });
  await unsendMessage(chat, "guest", id);
  return NextResponse.json({ ok: true });
});
