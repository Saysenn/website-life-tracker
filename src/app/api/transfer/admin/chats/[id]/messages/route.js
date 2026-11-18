import { NextResponse } from "next/server";
import { readJson, requireAdmin, route } from "@/lib/transfer/access";
import { getChat, postMessage, unsendMessage } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const POST = route(async (request, { params }) => {
  await requireAdmin();
  const chat = await getChat((await params).id);
  const { body } = await readJson(request);
  return NextResponse.json(await postMessage(chat, "admin", body));
});

export const DELETE = route(async (request, { params }) => {
  await requireAdmin();
  const chat = await getChat((await params).id);
  const { id } = await readJson(request);
  await unsendMessage(chat, "admin", id);
  return NextResponse.json({ ok: true });
});
