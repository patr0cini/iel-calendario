/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH: string;
  readonly VITE_FUNCTIONS_URL: string;
  readonly VITE_MS_CLIENT_ID: string;
  readonly VITE_MS_TENANT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected at build time by vite.config.ts (see the version badge). */
declare const __APP_COMMIT__: string;
declare const __APP_BUILT_AT__: string;
