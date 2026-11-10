import { NextResponse } from "next/server";
import { requireAdmin, route } from "@/lib/transfer/access";
import { rotateLinkKey } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const POST = route(async () => {
  await requireAdmin();
  return NextResponse.json({ key: await rotateLinkKey() });
});
