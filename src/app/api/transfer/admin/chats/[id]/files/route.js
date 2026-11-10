import { NextResponse } from "next/server";
import { readJson, requireAdmin, route } from "@/lib/transfer/access";
import { createFile, getChat } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const POST = route(async (request, { params }) => {
  await requireAdmin();
  const chat = await getChat((await params).id);
  return NextResponse.json(await createFile(chat, "admin", await readJson(request)));
});
