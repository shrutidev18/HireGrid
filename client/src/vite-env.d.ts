/// <reference types="vite/client" />

/**
 * Types the environment variables Vite injects at build time.
 *
 * Without this, `import.meta.env.VITE_API_URL` is typed `any` and a typo in the
 * variable name fails silently at runtime with `undefined` as the axios
 * baseURL. With it, the typo is a compile error.
 *
 * Only variables prefixed `VITE_` are exposed to browser code — that prefix is
 * Vite's guard against accidentally shipping a server secret to the client.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
