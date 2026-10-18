/** Typed access to build-time environment variables (see the root .env.example). */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  // Mocks stay on until the backend is available; set VITE_USE_MOCKS=false to hit the real API.
  useMocks: (import.meta.env.VITE_USE_MOCKS ?? 'true') === 'true',
  // Supabase Auth (used when mocks are off). The publishable key is public by design.
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
} as const
