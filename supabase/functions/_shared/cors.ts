// CORS (PROMPT.md section 2): allow only the GitHub Pages origin. Never "*".
//
// Set ALLOWED_ORIGIN in the Supabase function secrets to the production origin,
// e.g. https://<user>.github.io. When it is unset (local dev) we reflect the
// caller's origin so http://127.0.0.1:5173 works during development.

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");

export function corsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowOrigin = ALLOWED_ORIGIN ?? requestOrigin ?? "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    // Every custom header the app sends must be listed, or the browser blocks
    // the request at the preflight (x-ms-token = Microsoft sign-in).
    "Access-Control-Allow-Headers": "authorization, x-access-token, x-ms-token, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}
