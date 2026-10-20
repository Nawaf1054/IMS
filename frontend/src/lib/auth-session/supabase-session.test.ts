/** Tests for mapping Supabase sign-in errors to the app's error codes and messages. */
import { isApiError } from '../api-error'
import { toSignInError } from './supabase-session'

/** A Supabase-like auth error; overrides replace the defaults. */
const authError = (overrides: { code?: string; status?: number; message?: string; name?: string }) => ({
  name: 'AuthApiError',
  message: 'Something went wrong',
  status: 400,
  code: undefined,
  ...overrides,
})

describe('toSignInError', () => {
  it('maps wrong credentials to INVALID_CREDENTIALS', () => {
    const error = toSignInError(authError({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
    expect(isApiError(error, 'INVALID_CREDENTIALS')).toBe(true)
    expect(error.status).toBe(401)
  })

  it('maps a banned (deactivated) user to ACCOUNT_INACTIVE', () => {
    const error = toSignInError(authError({ code: 'user_banned', message: 'User is banned' }))
    expect(error.code).toBe('ACCOUNT_INACTIVE')
    expect(error.message).toMatch(/deactivated/)
  })

  it('maps rate limiting', () => {
    expect(toSignInError(authError({ code: 'over_request_rate_limit', status: 429 })).code).toBe('RATE_LIMITED')
  })

  it('treats fetch failures as network errors', () => {
    expect(toSignInError(authError({ name: 'AuthRetryableFetchError', status: 0 })).code).toBe('NETWORK_ERROR')
  })

  it('passes other errors through with their message', () => {
    const error = toSignInError(authError({ code: 'unexpected_failure', status: 500, message: 'Database error' }))
    expect(error.code).toBe('AUTH_ERROR')
    expect(error.status).toBe(500)
    expect(error.message).toBe('Database error')
  })
})
