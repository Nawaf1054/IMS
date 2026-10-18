import { apiClient } from '@/lib/api-client'
import type { BusinessSettings } from '@/types/models'

export const settingsApi = {
  get: () => apiClient.get<BusinessSettings>('/settings'),
  update: (input: Partial<BusinessSettings>) => apiClient.patch<BusinessSettings>('/settings', input),
}
