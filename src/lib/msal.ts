import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from "@azure/msal-browser";

// Microsoft 365 sign-in (hybrid model): staff with a M365 account sign in here;
// volunteers keep using their ministry link. Both end up at the same
// resolveIdentity() on the server, which derives permissions from the person's
// ministries — never from how they got in.

const CLIENT_ID = import.meta.env.VITE_MS_CLIENT_ID;
const TENANT_ID = import.meta.env.VITE_MS_TENANT_ID;

/** Sign-in is only offered when the app was built with the Entra ID settings. */
export const microsoftEnabled = Boolean(CLIENT_ID && TENANT_ID);

let instance: PublicClientApplication | null = null;

async function getInstance(): Promise<PublicClientApplication> {
  if (!instance) {
    instance = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        redirectUri: window.location.origin + import.meta.env.BASE_URL,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await instance.initialize();
  }
  return instance;
}

function account(app: PublicClientApplication): AccountInfo | null {
  return app.getAllAccounts()[0] ?? null;
}

/** Completes a redirect sign-in, if we are coming back from one. */
export async function initMicrosoft(): Promise<void> {
  if (!microsoftEnabled) return;
  const app = await getInstance();
  await app.handleRedirectPromise();
}

export async function signInMicrosoft(): Promise<void> {
  const app = await getInstance();
  await app.loginRedirect({ scopes: ["openid", "profile", "email"] });
}

export async function signOutMicrosoft(): Promise<void> {
  if (!microsoftEnabled) return;
  const app = await getInstance();
  const acc = account(app);
  if (acc) await app.logoutRedirect({ account: acc });
}

export function hasMicrosoftAccount(): boolean {
  return Boolean(instance && account(instance));
}

/**
 * A fresh ID token for the signed-in account, or null. MSAL renews it silently;
 * the token is the audience of our own app registration, which the server
 * validates against Entra ID's public keys.
 */
export async function getMicrosoftToken(): Promise<string | null> {
  if (!microsoftEnabled) return null;
  const app = await getInstance();
  const acc = account(app);
  if (!acc) return null;
  try {
    const result = await app.acquireTokenSilent({ account: acc, scopes: ["openid", "profile", "email"] });
    return result.idToken ?? null;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await app.acquireTokenRedirect({ account: acc, scopes: ["openid", "profile", "email"] });
    }
    return null;
  }
}
