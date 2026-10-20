/**
 * TanStack Query hooks and cache keys for the AI assistant. Mutations refresh the cached data they affect.
 * Every AI response carries the new quota, which updates the meter directly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { AI_ASSISTANT_ENABLED } from '@/config/constants'
import type { AiQuota } from '@/types/models'

import type { ChatTurn } from '../types'
import { assistantApi } from './assistant.api'

/** Cache keys for assistant data. */
export const assistantKeys = { quota: ['ai', 'quota'] as const }

/** The user's remaining AI requests. Disabled until the assistant ships. */
export function useAiQuota() {
  return useQuery({ queryKey: assistantKeys.quota, queryFn: assistantApi.quota, enabled: AI_ASSISTANT_ENABLED })
}

/** Every AI response carries the updated quota; keep the meter in sync without refetching. */
function useQuotaSync() {
  const queryClient = useQueryClient()
  return (result: { quota: AiQuota }) => queryClient.setQueryData(assistantKeys.quota, result.quota)
}

/** Sends a chat message. */
export function useChat() {
  const sync = useQuotaSync()
  return useMutation({ mutationFn: (messages: ChatTurn[]) => assistantApi.chat(messages), onSuccess: sync })
}

/** Generates the insights report for a period. */
export function useGenerateInsights() {
  const sync = useQuotaSync()
  return useMutation({ mutationFn: ({ start, end }: { start: string; end: string }) => assistantApi.insights(start, end), onSuccess: sync })
}

/** Drafts a product description. */
export function useGenerateDescription() {
  const sync = useQuotaSync()
  return useMutation({
    mutationFn: ({ name, category }: { name: string; category: string }) => assistantApi.productDescription(name, category),
    onSuccess: sync,
  })
}
