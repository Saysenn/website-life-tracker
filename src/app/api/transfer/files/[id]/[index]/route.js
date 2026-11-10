import { NextResponse } from "next/server";
import { HttpError, route } from "@/lib/transfer/access";
import { canUpload } from "@/lib/transfer/permissions";
import { getFile, putChunk } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";

export const PUT = route(async (request, { params }) => {
  const { id, index } = await params;
  const file = await getFile(id);
  await canUpload(file);
  const length = Number(request.headers.get("content-length"));
  if (length > file.chunkSize) throw new HttpError(413, "That part is too large.");
  await putChunk(file, Number(index), new Uint8Array(await request.arrayBuffer()));
  return NextResponse.json({ ok: true });
});
