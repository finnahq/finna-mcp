#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Finna } from "./finna.js";
import { registerFinnaTools } from "./tools.js";

const VERSION = "0.1.0";
const BASE_URL = process.env.FINNA_BASE_URL || "https://api.finna.sh";

function makeServer(client: Finna): McpServer {
  const server = new McpServer(
    { name: "finna", version: VERSION },
    {
      instructions:
        "Finna is a search API (keyword/BM25, vector, and hybrid). Call finna_list_indexes to discover indexes, then finna_search to retrieve documents for a query.",
    },
  );
  registerFinnaTools(server, client);
  return server;
}

// ---- local: stdio (one API key from the environment) -----------------------

async function runStdio(): Promise<void> {
  const apiKey = process.env.FINNA_API_KEY;
  if (!apiKey) {
    console.error("FINNA_API_KEY is required (stdio mode). Set it in your MCP client config's env.");
    process.exit(1);
  }
  const server = makeServer(new Finna({ apiKey, baseUrl: BASE_URL }));
  await server.connect(new StdioServerTransport());
  console.error("Finna MCP server running on stdio.");
}

// ---- hosted: Streamable HTTP (per-request API key via Bearer) ---------------

function bearer(req: IncomingMessage): string | null {
  const h = req.headers["authorization"];
  if (typeof h === "string" && h.startsWith("Bearer ")) return h.slice(7).trim() || null;
  return null;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

function rpcError(res: ServerResponse, status: number, code: number, message: string, extraHeaders?: Record<string, string>): void {
  res.writeHead(status, { "content-type": "application/json", ...extraHeaders });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

async function runHttp(): Promise<void> {
  const port = Number(process.env.PORT || 3333);
  const mcpPath = process.env.MCP_PATH || "/mcp";

  const http = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname === "/health" || url.pathname === "/healthz") {
        res.writeHead(200, { "content-type": "text/plain" }).end("ok");
        return;
      }
      if (url.pathname !== mcpPath) {
        res.writeHead(404).end();
        return;
      }
      // Stateless wrapper: each request is independent, so only POST is used.
      if (req.method !== "POST") {
        rpcError(res, 405, -32000, "Use POST for the MCP Streamable HTTP endpoint.", { allow: "POST" });
        return;
      }
      const apiKey = bearer(req);
      if (!apiKey) {
        rpcError(res, 401, -32001, "Missing API key — send 'Authorization: Bearer sk_live_…'.", {
          "www-authenticate": 'Bearer realm="finna"',
        });
        return;
      }

      const body = await readBody(req);
      // A fresh, stateless server + transport per request, bound to this caller's key.
      const server = makeServer(new Finna({ apiKey, baseUrl: BASE_URL }));
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true, // plain JSON responses (no SSE needed for an API wrapper)
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent) {
        rpcError(res, 500, -32603, `Internal error: ${(e as Error)?.message ?? String(e)}`);
      } else {
        res.end();
      }
    }
  });

  http.listen(port, () => {
    console.error(`Finna MCP server (Streamable HTTP) on http://localhost:${port}${mcpPath}`);
  });
}

const mode =
  process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http" ? "http" : "stdio";

(mode === "http" ? runHttp() : runStdio()).catch((e) => {
  console.error(e);
  process.exit(1);
});
