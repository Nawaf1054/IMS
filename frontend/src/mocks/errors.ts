/** Errors raised by the mock API; rendered as the backend's `{ detail, code }` body. */
export class MockApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, detail: string) {
    super(detail)
    this.status = status
    this.code = code
  }
}

export function fail(status: number, code: string, detail: string): never {
  throw new MockApiError(status, code, detail)
}
