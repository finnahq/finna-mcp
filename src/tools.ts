import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Finna, FinnaError } from "./finna.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const fail = (e: unknown): ToolResult => {
  const text =
    e instanceof FinnaError
      ? `Finna error ${e.status}: ${e.message}`
      : `Error: ${(e as Error)?.message ?? String(e)}`;
  return { content: [{ type: "text", text }], isError: true };
};

const fieldConfig = z.object({
  type: z.enum(["text", "number", "vector"]),
  searchable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  dims: z.number().int().positive().optional().describe("vector fields: dimensionality (required for vectors)"),
  metric: z.enum(["cosine"]).optional(),
});

/** Register every Finna tool on `server`, bound to `client`. */
export function registerFinnaTools(server: McpServer, client: Finna): void {
  server.registerTool(
    "finna_search",
    {
      title: "Search a Finna index",
      description:
        "Search a Finna index by keyword (BM25), vector, or hybrid retrieval. Call finna_list_indexes first to find the index id. Returns ranked hits, each with the document fields plus _score (and _highlights when highlight=true).",
      inputSchema: {
        index_id: z.string().describe("The index UUID (from finna_list_indexes)."),
        query: z.string().optional().describe("Text query. Supports AND/OR/NOT and quoted phrases."),
        vector: z.array(z.number()).optional().describe("Query embedding, for vector or hybrid search."),
        vector_field: z.string().optional().describe("Which vector field (omit if the index has exactly one)."),
        mode: z.enum(["text", "vector", "hybrid"]).optional().describe("Retrieval mode; inferred when omitted."),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
        filter: z
          .array(z.object({ field: z.string(), op: z.enum(["eq", "lt", "lte", "gt", "gte"]), value: z.any() }))
          .optional(),
        sort: z.string().optional().describe('Sortable number field; prefix with "-" for descending.'),
        prefix: z.boolean().optional().describe("Search-as-you-type: match the final token as a prefix."),
        fuzzy: z.boolean().optional().describe("Typo tolerance (length-based Levenshtein)."),
        highlight: z.boolean().optional().describe("Return per-field highlighted snippets."),
      },
    },
    async ({ index_id, ...request }) => {
      try {
        return ok(await client.search(index_id, request));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "finna_list_indexes",
    {
      title: "List Finna indexes",
      description: "List the indexes in your Finna organization, with their ids, names, and field schemas.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await client.listIndexes());
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "finna_get_index",
    {
      title: "Get a Finna index",
      description: "Fetch one index's configuration (fields, language) by id.",
      inputSchema: { index_id: z.string() },
    },
    async ({ index_id }) => {
      try {
        return ok(await client.getIndex(index_id));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "finna_create_index",
    {
      title: "Create a Finna index",
      description:
        "Create an index with typed fields. text → searchable/filterable; number → filterable/sortable; vector → dims + cosine. Requires a write- or admin-scoped key.",
      inputSchema: {
        name: z.string().describe("Display name, 1–64 chars."),
        language: z.string().optional().describe('Language code (en, de, …) or "auto".'),
        decompound: z.boolean().optional().describe("Split German compounds (default true)."),
        fields: z.record(fieldConfig),
      },
    },
    async (settings) => {
      try {
        return ok(await client.createIndex(settings));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "finna_upsert_documents",
    {
      title: "Upsert documents into a Finna index",
      description: "Insert or replace documents (by id) into an index. Each document must have a string 'id'.",
      inputSchema: {
        index_id: z.string(),
        documents: z.array(z.record(z.any())).describe("Documents; each needs a string 'id'."),
      },
    },
    async ({ index_id, documents }) => {
      try {
        return ok(await client.upsertDocuments(index_id, documents));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "finna_analyze",
    {
      title: "Analyze text (tokenization)",
      description:
        "Tokenize text with a language analyzer — useful to inspect German compound decompounding and stemming.",
      inputSchema: { text: z.string(), language: z.string().optional() },
    },
    async ({ text, language }) => {
      try {
        return ok(await client.analyze(text, language ?? "auto"));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
