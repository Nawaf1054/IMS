import { http } from 'msw'

import type { MovementType } from '@/types/models'

import { db, movementView, recordMovement } from '../db'
import { API, inDateRange, paginate, readBody, requireUser, route } from '../http'

export const stockHandlers = [
  http.get(
    `${API}/stock-movements`,
    route(({ request, url }) => {
      requireUser(request)
      const q = url.searchParams
      const type = q.get('type')
      const productId = Number(q.get('product_id')) || null
      const rows = db.movements
        .filter((m) => (!type || m.type === type) && (!productId || m.product_id === productId))
        .filter((m) => inDateRange(m.created_at, q.get('start_date'), q.get('end_date')))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .map(movementView)
      return paginate(rows, url)
    }),
  ),

  http.post(
    `${API}/stock-movements`,
    route(async ({ request }) => {
      const user = requireUser(request)
      const input = await readBody<{ product_id: number; type: MovementType; quantity: number; note?: string }>(request)
      return movementView(recordMovement({ ...input, note: input.note ?? '', user }))
    }),
  ),
]
