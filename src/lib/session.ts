// Access model (PROMPT.md section 5).
//
// Each ministry gets a URL like:
//   https://<user>.github.io/<repo>/#t=<token>
//
// The token lives in the URL fragment. We read it once, keep it in memory (and
// mirror it into sessionStorage so a reload inside the same tab survives), then
// strip the fragment from the address bar so it does not linger in history or
// get copied by accident.
//
// The token is NEVER the source of truth for permissions — that is decided
// server-side inside the Edge Functions. Here it is only carried and sent in the
// `x-access-token` header.

const STORAGE_KEY = "iel.session.token";

let inMemoryToken: string | null = null;

function parseTokenFromHash(hash: string): string | null {
  // hash looks like "#t=abc123" (or "#/route" for the router — ignore those).
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const token = params.get("t");
  return token && token.length > 0 ? token : null;
}

/**
 * Reads the token from the URL fragment (if present), persists it for the tab,
 * and clears the fragment. Call once at startup, before rendering.
 */
export function initSessionFromUrl(): void {
  const fromHash = parseTokenFromHash(window.location.hash);
  if (fromHash) {
    inMemoryToken = fromHash;
    try {
      sessionStorage.setItem(STORAGE_KEY, fromHash);
    } catch {
      // sessionStorage may be unavailable (private mode); in-memory still works.
    }
    // Remove the fragment without adding a history entry.
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", cleanUrl);
    return;
  }

  try {
    inMemoryToken = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    inMemoryToken = null;
  }
}

export function getToken(): string | null {
  return inMemoryToken;
}

export function clearSession(): void {
  inMemoryToken = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
