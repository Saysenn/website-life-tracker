import { CLEANER_TOOLS } from "@/lib/transfer/cleaner";
import { createMcpServer } from "@/lib/transfer/mcp-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const { POST, GET, DELETE } = createMcpServer({
  name: "life-tracker-metadata-cleaner",
  tools: CLEANER_TOOLS,
  instructions:
    "Removes hidden metadata (GPS location, camera, author, owner, edit history, dates) from photos, PDFs, Office files, audio and video. " +
    "Pass a file_id from the file transfer server, an https source_url, or content_base64 with file_name. The cleaned copy is saved " +
    "to the admin's Grok chat, or sent to a visitor when chat_id is given, and returned inline when it is 3 MB or less.",
});
