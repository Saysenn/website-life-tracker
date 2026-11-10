import { NextResponse } from "next/server";
import { HttpError } from "@/lib/transfer/access";
import { TOOLS, agentAccess, runTool } from "@/lib/transfer/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROTOCOL = "2025-06-18";

const INSTRUCTIONS =
  "Life Tracker file transfer. To deliver files to the admin, call upload_file without chat_id; they arrive in the Grok chat. " +
  "People who open the transfer link become chats too: list_chats shows them, read_chat reads them, and send_message or " +
  "upload_file with their chat_id answers them as the admin. Everything is deleted 24 hours after a chat starts.";

const reply = (id, result) => ({ jsonrpc: "2.0", id, result });
const failure = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(message) {
  const { id, method, params } = message ?? {};
  if (id === undefined || id === null) return null;

  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "life-tracker-transfer", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call":
      try {
        return reply(id, await runTool(params?.name, params?.arguments));
      } catch (error) {
        if (!(error instanceof HttpError)) console.error("Agent tool failed", error);
        const text = error instanceof HttpError ? error.message : "The tool failed. Try again.";
        return reply(id, { content: [{ type: "text", text }], isError: true });
      }
    default:
      return failure(id, -32601, `Method ${method} is not supported.`);
  }
}

export async function POST(request) {
  const access = agentAccess(request);
  if (access === "disabled") return new NextResponse("Not found", { status: 404 });
  if (access === "denied") {
    return NextResponse.json(failure(null, -32001, "Unauthorized"), {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(failure(null, -32700, "Parse error"), { status: 400 });
  }

  const batch = Array.isArray(body);
  const results = (await Promise.all((batch ? body : [body]).map(handle))).filter(Boolean);
  if (!results.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(batch ? results : results[0], { headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export const DELETE = GET;
