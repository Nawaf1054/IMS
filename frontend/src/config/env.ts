/** Typed access to build-time environment variables (see the root .env.example). */
export const env = {
  /** Backend base URL including the version prefix. Relative (/api/v1) works behind a proxy. */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  /** Supabase Auth. The publishable key is public by design. */
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
} as const
