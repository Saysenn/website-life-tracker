import { NextResponse } from "next/server";
import { HttpError, requireAdmin, route } from "@/lib/transfer/access";
import { setAutoDelete } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  await requireAdmin();
  const { autoDelete } = await request.json().catch(() => ({}));
  if (typeof autoDelete !== "boolean") throw new HttpError(400, "Send autoDelete as true or false.");
  await setAutoDelete(autoDelete);
  return NextResponse.json({ autoDelete });
});
