import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/transfer/access";
import { restoreChat } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const POST = route(async (request, { params }) => {
  await requireAdmin();
  const chat = await restoreChat((await params).id);
  return NextResponse.json({ ok: true, id: chat.id });
});
