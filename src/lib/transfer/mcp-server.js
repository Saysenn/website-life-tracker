import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./access";
import { agentAccess } from "./agent";

const PROTOCOL = "2025-06-18";

const reply = (id, result) => ({ jsonrpc: "2.0", id, result });
const failure = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function runTool(tools, name, args) {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) throw new HttpError(404, `Unknown tool ${name}.`);
  const result = await tool.run(args ?? {});
  return result?.content ? result : { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

/** A stateless MCP server over plain JSON POST, guarded by AGENT_API_KEY. */
export function createMcpServer({ name, instructions, tools }) {
  async function handle(message) {
    const { id, method, params } = message ?? {};
    if (id === undefined || id === null) return null;
    switch (method) {
      case "initialize":
        return reply(id, {
          protocolVersion: params?.protocolVersion || PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version: "1.0.0" },
          instructions,
        });
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, { tools: tools.map(({ name: tool, description, inputSchema }) => ({ name: tool, description, inputSchema })) });
      case "tools/call":
        try {
          return reply(id, await runTool(tools, params?.name, params?.arguments));
        } catch (error) {
          if (!(error instanceof HttpError)) console.error("Agent tool failed", error);
          const text = error instanceof HttpError ? error.message : "The tool failed. Try again.";
          return reply(id, { content: [{ type: "text", text }], isError: true });
        }
      default:
        return failure(id, -32601, `Method ${method} is not supported.`);
    }
  }

  async function POST(request) {
    const access = agentAccess(request);
    if (access === "disabled") return new NextResponse("Not found", { status: 404 });
    if (access === "denied") {
      return NextResponse.json(failure(null, -32001, "Unauthorized"), { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
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

  const GET = () => new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
  return { POST, GET, DELETE: GET };
}
