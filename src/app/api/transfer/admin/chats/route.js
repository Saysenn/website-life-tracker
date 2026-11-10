import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/transfer/access";
import { listChats, listFiles, purgeExpired } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  await requireAdmin();
  await purgeExpired();
  const withFiles = request.nextUrl.searchParams.get("files") === "1";
  const [chats, files] = await Promise.all([listChats(), withFiles ? listFiles() : null]);
  return NextResponse.json({ chats, files });
});
