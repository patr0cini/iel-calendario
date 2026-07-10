// Small HTTP helpers shared by every function. All responses carry the CORS
// headers and `Cache-Control: no-store` (PROMPT.md section 9).

import { corsHeaders } from "./cors.ts";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function preflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export function jsonResponse(req: Request, status: number, body: unknown): Response {
  const headers = {
    ...corsHeaders(req.headers.get("origin")),
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

export function errorResponse(req: Request, err: unknown): Response {
  if (err instanceof HttpError) {
    return jsonResponse(req, err.status, { error: err.message });
  }
  // Never leak internals; log server-side only.
  console.error("Unhandled error:", err);
  return jsonResponse(req, 500, { error: "internal error" });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

/**
 * Path segments after the function name. For a request to
 * `/functions/v1/ministries/{id}` invoked as function "ministries", returns
 * `["{id}"]`.
 */
export function pathSegments(req: Request, functionName: string): string[] {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf(functionName);
  return idx >= 0 ? parts.slice(idx + 1) : [];
}
