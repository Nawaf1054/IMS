import { http } from 'msw'

import type { BusinessSettings } from '@/types/models'

import { db } from '../db'
import { API, fail, readBody, requireAdmin, requireUser, route } from '../http'

export const CURRENCIES = ['SAR', 'AED', 'KWD', 'USD']

export const settingsHandlers = [
  http.get(
    `${API}/settings`,
    route(({ request }): BusinessSettings => {
      requireUser(request)
      return { ...db.settings }
    }),
  ),

  http.patch(
    `${API}/settings`,
    route(async ({ request }): Promise<BusinessSettings> => {
      requireAdmin(request)
      const input = await readBody<Partial<BusinessSettings>>(request)
      if (input.business_name !== undefined && !input.business_name.trim()) {
        fail(422, 'VALIDATION_ERROR', 'Business name is required. It appears on every invoice.')
      }
      if (input.currency !== undefined && !CURRENCIES.includes(input.currency)) fail(422, 'VALIDATION_ERROR', 'Unsupported currency.')
      if (input.tax_rate !== undefined) {
        const rate = Number(input.tax_rate)
        if (!Number.isFinite(rate) || rate < 0 || rate > 1) fail(422, 'VALIDATION_ERROR', 'Enter a rate between 0 and 100.')
      }
      Object.assign(db.settings, {
        ...(input.business_name !== undefined && { business_name: input.business_name.trim() }),
        ...(input.business_address !== undefined && { business_address: input.business_address.trim() }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.tax_rate !== undefined && { tax_rate: String(Number(input.tax_rate)) }),
      })
      return { ...db.settings }
    }),
  ),
]
