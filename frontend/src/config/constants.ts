export const APP_NAME = 'IMS'
export const APP_VERSION = '1.0'

/** PRD §10: lists default to 20 rows, never more than 100. */
export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const

export const SEARCH_DEBOUNCE_MS = 250

export const STORAGE_KEYS = {
  theme: 'ims.theme',
  sidebarCollapsed: 'ims.sidebar-collapsed',
  accessToken: 'ims.access-token',
  refreshToken: 'ims.refresh-token',
  supabaseSession: 'ims.supabase-session',
} as const
