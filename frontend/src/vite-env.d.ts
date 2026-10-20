/** Types for the VITE_* environment variables the app reads. */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL including the version prefix, e.g. http://localhost:8000/api/v1 */
  readonly VITE_API_BASE_URL?: string
  /** Supabase project URL (Auth). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable (anon) key. Public by design; never the secret key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
