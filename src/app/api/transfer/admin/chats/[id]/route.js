import { NextResponse } from "next/server";
import { readJson, requireAdmin, route } from "@/lib/transfer/access";
import { deleteChat, deleteChatForever, getChat, setBlocked } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const PATCH = route(async (request, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const { blocked } = await readJson(request);
  await setBlocked(id, blocked);
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (request, { params }) => {
  await requireAdmin();
  const { id } = await params;
  // ?forever=1 empties a chat out of Recently deleted; otherwise it only moves there.
  if (request.nextUrl.searchParams.get("forever") === "1") {
    await deleteChatForever(id);
  } else {
    await getChat(id);
    await deleteChat(id);
  }
  return NextResponse.json({ ok: true });
});
