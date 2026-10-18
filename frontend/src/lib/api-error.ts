import type { ApiErrorBody } from '@/types/api'

/** Every failed request surfaces as an ApiError carrying the backend's `{ detail, code }`. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, body: ApiErrorBody) {
    super(body.detail)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}

export const networkError = () => new ApiError(0, { detail: 'Can’t reach the server. Check your connection and try again.', code: 'NETWORK_ERROR' })

export async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>
    return new ApiError(response.status, {
      detail: body.detail ?? response.statusText,
      code: body.code ?? 'HTTP_ERROR',
    })
  } catch {
    return new ApiError(response.status, { detail: response.statusText || 'Request failed', code: 'HTTP_ERROR' })
  }
}
