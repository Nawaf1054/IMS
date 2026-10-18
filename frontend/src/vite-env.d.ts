/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL including the version prefix, e.g. http://localhost:8000/api/v1 */
  readonly VITE_API_BASE_URL?: string
  /** "true" serves the API from the in-browser mock layer (src/mocks) instead of the backend. */
  readonly VITE_USE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
