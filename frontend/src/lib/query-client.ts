/** The app's single TanStack Query cache and its defaults (cache time, retries). */
import { QueryClient } from '@tanstack/react-query'

import { ApiError } from './api-client'

/** Shared query cache. Client errors (4xx) aren't retried; others are retried twice. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors (validation, permissions, not found) won't succeed on retry.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 2
      },
    },
  },
})
