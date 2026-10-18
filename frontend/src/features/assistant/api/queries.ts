import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AiQuota } from '@/types/models'

import type { ChatTurn } from '../types'
import { assistantApi } from './assistant.api'

export const assistantKeys = { quota: ['ai', 'quota'] as const }

export function useAiQuota() {
  return useQuery({ queryKey: assistantKeys.quota, queryFn: assistantApi.quota })
}

/** Every AI response carries the updated quota; keep the meter in sync without refetching. */
function useQuotaSync() {
  const queryClient = useQueryClient()
  return (result: { quota: AiQuota }) => queryClient.setQueryData(assistantKeys.quota, result.quota)
}

export function useChat() {
  const sync = useQuotaSync()
  return useMutation({ mutationFn: (messages: ChatTurn[]) => assistantApi.chat(messages), onSuccess: sync })
}

export function useGenerateInsights() {
  const sync = useQuotaSync()
  return useMutation({ mutationFn: ({ start, end }: { start: string; end: string }) => assistantApi.insights(start, end), onSuccess: sync })
}

export function useGenerateDescription() {
  const sync = useQuotaSync()
  return useMutation({
    mutationFn: ({ name, category }: { name: string; category: string }) => assistantApi.productDescription(name, category),
    onSuccess: sync,
  })
}
