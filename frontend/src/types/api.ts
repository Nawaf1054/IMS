/**
 * Transport-level types shared by every API call.
 * Mirrors the backend conventions in docs/PRD.md §8.
 */

/** Paginated list envelope (default page size 20, max 100). */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

/** Every error response: `{ "detail": "message", "code": "ERROR_CODE" }`. */
export interface ApiErrorBody {
  detail: string
  code: string
}

export interface PageParams {
  page?: number
  page_size?: number
}

/** Inclusive date range as ISO dates (YYYY-MM-DD). */
export interface DateRangeParams {
  start_date?: string
  end_date?: string
}

/**
 * Money travels as a decimal string (Python `Decimal` → JSON string) so no
 * precision is lost. Never parse it with parseFloat for arithmetic; see lib/money.ts.
 */
export type Money = string
