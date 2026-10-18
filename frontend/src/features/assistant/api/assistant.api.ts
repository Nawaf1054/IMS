import { apiClient } from '@/lib/api-client'
import type { AiQuota } from '@/types/models'

import type { ChatReply, ChatTurn, InsightsReport, ProductDescriptionResult } from '../types'

export const assistantApi = {
  quota: () => apiClient.get<AiQuota>('/ai/quota'),
  chat: (messages: ChatTurn[]) => apiClient.post<ChatReply>('/ai/chat', { messages }),
  insights: (start_date: string, end_date: string) => apiClient.post<InsightsReport>('/ai/insights', { start_date, end_date }),
  productDescription: (name: string, category: string) => apiClient.post<ProductDescriptionResult>('/ai/product-description', { name, category }),
}
