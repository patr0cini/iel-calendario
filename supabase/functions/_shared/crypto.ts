// SHA-256 of a clear token, hex-encoded (PROMPT.md section 9). We only ever
// store and compare the hash; the clear token is shown to the admin once.

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
