/** TanStack Query hooks and cache keys for users (admin only). Mutations refresh the cached data they affect. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type CreateUserInput, type UpdateUserInput, usersApi } from './users.api'

/** Cache key for the user list. */
export const userKeys = { all: ['users'] as const }

/** All users (up to 100). */
export function useUsers(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: userKeys.all, queryFn: usersApi.list, select: (page) => page.items, ...options })
}

/** Creates a user. */
export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUserInput) => usersApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}

/** Edits, deactivates or reactivates a user. */
export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateUserInput }) => usersApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}
