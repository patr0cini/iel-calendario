// CORS (PROMPT.md section 2): allow only our own origins. Never "*".
//
// Set ALLOWED_ORIGIN in the Supabase function secrets to the production
// origin(s), comma-separated — e.g. "https://app.iel.pt,https://ebd.iel.pt".
// When it is unset (local dev) we reflect the caller's origin so
// http://127.0.0.1:5173 works during development.

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function corsHeaders(requestOrigin: string | null): Record<string, string> {
  // A caller from a listed origin gets it echoed back; anyone else gets the
  // primary origin, which their browser will refuse.
  const allowOrigin =
    ALLOWED_ORIGINS.length === 0
      ? (requestOrigin ?? "")
      : requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
        ? requestOrigin
        : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    // Every custom header the app sends must be listed, or the browser blocks
    // the request at the preflight (x-ms-token / x-google-token = sign-in).
    "Access-Control-Allow-Headers": "authorization, x-access-token, x-ms-token, x-google-token, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}
