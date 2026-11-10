import { TOOLS } from "@/lib/transfer/agent";
import { createMcpServer } from "@/lib/transfer/mcp-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const { POST, GET, DELETE } = createMcpServer({
  name: "life-tracker-transfer",
  tools: TOOLS,
  instructions:
    "Life Tracker file transfer. To deliver files to the admin, call upload_file without chat_id; they arrive in the Grok chat. " +
    "People who open the transfer link become chats too: list_chats shows them, read_chat reads them, and send_message or " +
    "upload_file with their chat_id answers them as the admin. Everything is deleted 24 hours after a chat starts.",
});
