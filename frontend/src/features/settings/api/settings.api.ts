/** HTTP calls for the business settings (/settings) endpoints. Components use the hooks in queries.ts rather than calling these directly. */
import { apiClient } from '@/lib/api-client'
import type { BusinessSettings } from '@/types/models'

/** Settings endpoints. */
export const settingsApi = {
  /** The business settings. */
  get: () => apiClient.get<BusinessSettings>('/settings'),
  /** Admin: changes some settings. */
  update: (input: Partial<BusinessSettings>) => apiClient.patch<BusinessSettings>('/settings', input),
}
