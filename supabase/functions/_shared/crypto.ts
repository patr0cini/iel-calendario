// SHA-256 of a clear token, hex-encoded (PROMPT.md section 9). We only ever
// store and compare the hash; the clear token is shown to the admin once.

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Signature for public share links: HMAC-SHA256 keyed with the service-role
 * key (never leaves the server), truncated to 32 hex chars. Makes share URLs
 * unguessable without granting any other access.
 */
export async function shareSignature(serviceId: string, ministry: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`share:${serviceId}:${ministry}`));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
