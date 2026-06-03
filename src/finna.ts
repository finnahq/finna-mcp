// Minimal typed Finna HTTP client (fetch-based) — just what the MCP tools need.
// Kept self-contained so the server has no unpublished dependencies.

export class FinnaError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FinnaError";
  }
}

export interface FinnaOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_BASE = "https://api.finna.sh";

export class Finna {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: FinnaOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async req(method: string, path: string, body?: unknown): Promise<unknown> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.baseUrl + path, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      if (!res.ok) {
        const message =
          (parsed && typeof parsed === "object" && "error" in parsed
            ? String((parsed as { error: unknown }).error)
            : undefined) ?? res.statusText ?? `HTTP ${res.status}`;
        throw new FinnaError(res.status, message);
      }
      return parsed;
    } finally {
      clearTimeout(t);
    }
  }

  private id(s: string): string {
    return encodeURIComponent(s);
  }

  listIndexes(): Promise<unknown> {
    return this.req("GET", "/v1/indexes");
  }
  getIndex(indexId: string): Promise<unknown> {
    return this.req("GET", `/v1/indexes/${this.id(indexId)}`);
  }
  createIndex(settings: unknown): Promise<unknown> {
    return this.req("POST", "/v1/indexes", settings);
  }
  upsertDocuments(indexId: string, documents: unknown[]): Promise<unknown> {
    return this.req("POST", `/v1/indexes/${this.id(indexId)}/documents`, { documents });
  }
  search(indexId: string, request: unknown): Promise<unknown> {
    return this.req("POST", `/v1/indexes/${this.id(indexId)}/search`, request);
  }
  analyze(text: string, language: string): Promise<unknown> {
    return this.req("POST", "/v1/_analyze", { text, language });
  }
}
