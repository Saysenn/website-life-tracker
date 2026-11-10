import { NextResponse } from "next/server";
import { readJson, requireAdmin, route } from "@/lib/transfer/access";
import { deleteChat, getChat, setBlocked } from "@/lib/transfer/store";

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
  await getChat(id);
  await deleteChat(id);
  return NextResponse.json({ ok: true });
});
