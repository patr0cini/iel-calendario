// Thin client for the Supabase Edge Functions.
//
// INVARIANT (PROMPT.md section 2): the browser only ever talks to the Edge
// Functions. It never touches `*.supabase.co/rest/v1/`. The anon key is not used
// for domain data. Every request carries the access token in `x-access-token`.

import { getToken } from "./session";
import { getMicrosoftToken, hasMicrosoftAccount } from "./msal";

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Set false for endpoints that do not require a token (e.g. /health). */
  auth?: boolean;
}

export async function apiFetch<T>(
  path: string,
  { method = "GET", body, signal, auth = true }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth) {
    // A Microsoft sign-in wins over a ministry link when both are present.
    if (hasMicrosoftAccount()) {
      const msToken = await getMicrosoftToken();
      if (msToken) headers["x-ms-token"] = msToken;
    }
    const token = getToken();
    if (token) headers["x-access-token"] = token;
  }

  const response = await fetch(`${FUNCTIONS_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // response had no JSON body
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
