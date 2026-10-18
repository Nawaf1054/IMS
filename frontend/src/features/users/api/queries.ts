import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type CreateUserInput, type UpdateUserInput, usersApi } from './users.api'

export const userKeys = { all: ['users'] as const }

export function useUsers(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: userKeys.all, queryFn: usersApi.list, select: (page) => page.items, ...options })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUserInput) => usersApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateUserInput }) => usersApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}
