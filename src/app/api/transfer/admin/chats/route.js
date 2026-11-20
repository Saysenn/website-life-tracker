import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/transfer/access";
import { listChats, listDeletedChats, listFiles, purgeExpired } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  await requireAdmin();
  await purgeExpired();
  const withFiles = request.nextUrl.searchParams.get("files") === "1";
  const [chats, files, deleted] = await Promise.all([
    listChats(),
    withFiles ? listFiles() : null,
    withFiles ? listDeletedChats() : null,
  ]);
  return NextResponse.json({ chats, files, deleted });
});
