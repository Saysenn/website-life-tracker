import { NextResponse } from "next/server";
import { route } from "@/lib/transfer/access";
import { INLINE_TYPES } from "@/lib/transfer/constants";
import { notifyAdmin } from "@/lib/transfer/notify";
import { canDelete, canRead, canUpload } from "@/lib/transfer/permissions";
import { completeFile, deleteFile, fileStream, getFile } from "@/lib/transfer/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const contentDisposition = (type, name) => {
  const ascii = name.replace(/[^\x20-\x7E]|["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

export const GET = route(async (request, { params }) => {
  const file = await getFile((await params).id);
  await canRead(file);
  const inline = request.nextUrl.searchParams.get("inline") === "1" && INLINE_TYPES.includes(file.type);
  return new Response(fileStream(file), {
    headers: {
      "Content-Type": inline ? file.type : "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", file.name),
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export const POST = route(async (request, { params }) => {
  const file = await getFile((await params).id);
  await canUpload(file);
  const { chat, message } = await completeFile(file);
  if (file.sender === "guest") notifyAdmin({ type: "file", chat, name: file.name, size: file.size });
  return NextResponse.json(message);
});

export const DELETE = route(async (request, { params }) => {
  const file = await getFile((await params).id);
  await canDelete(file);
  await deleteFile(file);
  return NextResponse.json({ ok: true });
});
