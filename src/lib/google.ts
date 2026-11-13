// "Sign in with Google" (Google Identity Services), the second personal door
// next to Microsoft: people pick whichever account they use (e.g. a Gmail).
// Google hands us an ID token (a JWT, valid for 1 hour); the server verifies it
// against Google's public keys and finds the person by email — permissions are
// derived from their ministries there, never from the token.
//
// The token is kept in sessionStorage for the tab. When it is about to expire
// we ask Google for a new one silently (auto-select), which works as long as
// the person stays signed in to Google in this browser.

// Public identifier, not a secret (it is in every page that shows the button).
const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || "266316669194-um6nljgok8il1mpc2mjb138jpl0s3nbs.apps.googleusercontent.com";

export const googleEnabled = CLIENT_ID.length > 0;

const TOKEN_KEY = "iel.google.idToken";
const HINT_KEY = "iel.google.used"; // remembers that this browser chose Google
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface CredentialResponse {
  credential: string;
}

interface GoogleId {
  initialize(config: {
    client_id: string;
    callback: (r: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
  prompt(): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const listeners = new Set<() => void>();
let gisPromise: Promise<GoogleId> | null = null;
let refreshTimer: number | undefined;

function expiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Number(payload.exp) * 1000;
  } catch {
    return 0;
  }
}

function stored(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** The current Google ID token, if there is one with at least a minute left. */
export function getGoogleToken(): string | null {
  const token = stored();
  return token && expiry(token) - Date.now() > 60_000 ? token : null;
}

export function hasGoogleAccount(): boolean {
  return getGoogleToken() !== null;
}

/** Re-render when the Google session starts, renews or ends. */
export function onGoogleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function save(token: string | null) {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(HINT_KEY, "1");
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // storage unavailable (private mode): the session lasts until reload
  }
  scheduleRefresh();
  listeners.forEach((fn) => fn());
}

function loadGis(): Promise<GoogleId> {
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const done = () => {
        const id = window.google!.accounts.id;
        id.initialize({
          client_id: CLIENT_ID,
          callback: (r) => save(r.credential),
          auto_select: true,
          cancel_on_tap_outside: false,
          use_fedcm_for_prompt: true,
        });
        resolve(id);
      };
      if (window.google?.accounts?.id) return done();
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = done;
      s.onerror = () => reject(new Error("Não foi possível carregar o login da Google."));
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

// Ask for a fresh token 5 minutes before this one expires.
function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  const token = stored();
  if (!token) return;
  const wait = expiry(token) - Date.now() - 5 * 60_000;
  refreshTimer = window.setTimeout(() => void renewGoogle(), Math.max(wait, 0));
}

/** Silent renewal for someone who signed in with Google before in this browser. */
export async function renewGoogle(): Promise<void> {
  if (!googleEnabled) return;
  let used = false;
  try {
    used = localStorage.getItem(HINT_KEY) === "1";
  } catch {
    // ignore
  }
  if (!used || hasGoogleAccount()) return scheduleRefresh();
  (await loadGis()).prompt();
}

/** Draws Google's own button into `el`. */
export async function renderGoogleButton(el: HTMLElement): Promise<void> {
  const id = await loadGis();
  id.renderButton(el, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "rectangular",
    logo_alignment: "center",
    width: Math.min(el.clientWidth || 288, 400),
    locale: "pt-PT",
  });
}

export function signOutGoogle(): void {
  try {
    localStorage.removeItem(HINT_KEY);
  } catch {
    // ignore
  }
  window.google?.accounts?.id?.disableAutoSelect();
  save(null);
}
