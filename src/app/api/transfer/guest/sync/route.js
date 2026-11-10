import { NextResponse } from "next/server";
import { readJson, requireGuest, route } from "@/lib/transfer/access";
import { syncChat } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  const chat = await requireGuest();
  return NextResponse.json(await syncChat(chat, "guest", await readJson(request)));
});
