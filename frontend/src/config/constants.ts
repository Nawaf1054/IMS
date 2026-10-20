/** App-wide constants: page sizes, debounce timing, storage keys and feature flags. */

/** Product name shown in the UI. */
export const APP_NAME = 'IMS'
/** Version shown in the UI. */
export const APP_VERSION = '1.0'

/** PRD §10: lists default to 20 rows, never more than 100. */
export const DEFAULT_PAGE_SIZE = 20
/** Page sizes the list pager offers. */
export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const

/** How long search boxes wait after the last keystroke before searching. */
export const SEARCH_DEBOUNCE_MS = 250

/**
 * The AI assistant (PRD §6.8, milestone M8) isn't built on the backend yet. While this is false the
 * assistant page shows a "Coming soon" preview and nothing calls the /ai endpoints.
 */
export const AI_ASSISTANT_ENABLED = false

/** localStorage keys used by the app. */
export const STORAGE_KEYS = {
  theme: 'ims.theme',
  sidebarCollapsed: 'ims.sidebar-collapsed',
  supabaseSession: 'ims.supabase-session',
} as const
