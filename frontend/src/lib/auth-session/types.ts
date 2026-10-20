/**
 * Where the browser's session lives. Supabase Auth issues the tokens (sign-in, refresh, sign-out);
 * the backend only verifies them.
 */
export interface AuthSession {
  /** Synchronous hint for the first render: is there a stored session worth restoring? */
  hasStoredSession(): boolean
  /** Throws ApiError (e.g. INVALID_CREDENTIALS, ACCOUNT_INACTIVE) on failure. */
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  getAccessToken(): Promise<string | null>
  /** Tries to renew the access token; false means the session is over. */
  refresh(): Promise<boolean>
}
