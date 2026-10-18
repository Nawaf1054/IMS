import { STORAGE_KEYS } from '@/config/constants'
import type { TokenPair } from '@/types/models'

import { readStorage, writeStorage } from './storage'

/** Persists the JWT pair between reloads. */
export const authStorage = {
  getAccessToken: () => readStorage(STORAGE_KEYS.accessToken),
  getRefreshToken: () => readStorage(STORAGE_KEYS.refreshToken),
  setTokens(tokens: Pick<TokenPair, 'access_token' | 'refresh_token'>) {
    writeStorage(STORAGE_KEYS.accessToken, tokens.access_token)
    writeStorage(STORAGE_KEYS.refreshToken, tokens.refresh_token)
  },
  clear() {
    writeStorage(STORAGE_KEYS.accessToken, null)
    writeStorage(STORAGE_KEYS.refreshToken, null)
  },
}
