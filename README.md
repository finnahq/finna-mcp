# @finnahq/mcp

MCP (Model Context Protocol) server for **Finna** — connect Claude, Cursor, and
agent frameworks to Finna search (keyword/BM25, vector, and hybrid retrieval).

The same binary runs two ways:

- **Local (stdio)** — add `npx -y @finnahq/mcp` to your MCP client config with your API key in `env`.
- **Hosted (Streamable HTTP)** — point a client at a URL and authenticate with `Authorization: Bearer sk_live_…`.

Built on the official `@modelcontextprotocol/sdk` (MCP spec **2025-06-18**).

## Tools

| Tool | What it does |
|---|---|
| `finna_search` | Search an index — text / vector / hybrid (filters, sort, prefix, fuzzy, highlight) |
| `finna_list_indexes` | List your organization's indexes |
| `finna_get_index` | Get one index's field schema |
| `finna_create_index` | Create an index _(write/admin key)_ |
| `finna_upsert_documents` | Insert/replace documents _(write/admin key)_ |
| `finna_analyze` | Inspect tokenization (German decompounding, stemming) |

Get an API key (`sk_live_…`) from the Finna console → **API keys**.

## Connect — Claude Code

Hosted (fewest moving parts):

```bash
claude mcp add --transport http finna https://mcp.finna.sh/mcp \
  --header "Authorization: Bearer $FINNA_API_KEY"
```

Local (stdio):

```bash
claude mcp add finna --env FINNA_API_KEY=sk_live_… -- npx -y @finnahq/mcp
```

Project-scoped `.mcp.json` (commit it; the key comes from your environment):

```json
{
  "mcpServers": {
    "finna": {
      "type": "http",
      "url": "https://mcp.finna.sh/mcp",
      "headers": { "Authorization": "Bearer ${FINNA_API_KEY}" }
    }
  }
}
```

## Connect — Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "finna": {
      "url": "https://mcp.finna.sh/mcp",
      "headers": { "Authorization": "Bearer YOUR_FINNA_API_KEY" }
    }
  }
}
```

Or local (stdio): replace the object with
`{ "command": "npx", "args": ["-y", "@finnahq/mcp"], "env": { "FINNA_API_KEY": "sk_live_…" } }`.

## Connect — Claude Desktop

Use the **local (npx)** config — Claude Desktop's JSON config has a known bug with remote `url` fields, so for hosted URLs use **Settings → Connectors** (Pro/Max/Team/Enterprise) instead.

`~/Library/Application Support/Claude/claude_desktop_config.json` (Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "finna": {
      "command": "npx",
      "args": ["-y", "@finnahq/mcp"],
      "env": { "FINNA_API_KEY": "sk_live_…" }
    }
  }
}
```

## Connect — Claude API (Messages, MCP connector)

```json
{ "type": "url", "url": "https://mcp.finna.sh/mcp", "name": "finna",
  "authorization_token": "sk_live_…" }
```

## Self-hosting (Streamable HTTP)

Run the hosted mode behind a TLS-terminating proxy (it speaks plain HTTP):

```bash
MCP_TRANSPORT=http PORT=3333 npx -y @finnahq/mcp
# or, from source:  node dist/index.js --http
```

Environment:

| Var | Default | Notes |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | set `http` (or pass `--http`) for Streamable HTTP |
| `PORT` | `3333` | HTTP mode |
| `MCP_PATH` | `/mcp` | HTTP mode endpoint path |
| `FINNA_BASE_URL` | `https://api.finna.sh` | the Finna engine base URL |
| `FINNA_API_KEY` | — | **stdio mode only**; HTTP mode reads the per-request `Authorization` header |

The HTTP endpoint is **stateless** — each request carries its own bearer key, so it
serves many tenants and scales horizontally behind any load balancer. Health probe
at `GET /health`.

## Auth

The Finna API key travels as `Authorization: Bearer sk_live_…` on every request —
spec-compliant (the MCP OAuth flow is optional for servers). This works in Claude
Code, Cursor, VS Code, and the Claude API. The Claude **web UI** Connectors require
OAuth, which isn't supported yet (planned).

## Develop

```bash
npm install && npm run build
# stdio:
FINNA_API_KEY=sk_live_… FINNA_BASE_URL=http://localhost:7700 node dist/index.js
# hosted:
MCP_TRANSPORT=http PORT=3333 FINNA_BASE_URL=http://localhost:7700 node dist/index.js
```
