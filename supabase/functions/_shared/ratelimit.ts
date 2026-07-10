// Per-token rate limit: 60 requests/minute (PROMPT.md section 9).
//
// This is an in-memory sliding window scoped to a single edge worker. Workers
// are ephemeral, so this is defense-in-depth rather than a hard global cap —
// enough to blunt a hot loop or a leaked token being hammered.

import { HttpError } from "./http.ts";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

const hits = new Map<string, number[]>();

export function enforceRateLimit(key: string): void {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    throw new HttpError(429, "rate limit exceeded");
  }
  recent.push(now);
  hits.set(key, recent);
}
