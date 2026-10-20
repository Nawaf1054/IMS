/**
 * HTTP calls for the AI assistant (/ai) endpoints. Components use the hooks in queries.ts rather than calling these directly.
 * Not called while AI_ASSISTANT_ENABLED is false.
 */
import { apiClient } from '@/lib/api-client'
import type { AiQuota } from '@/types/models'

import type { ChatReply, ChatTurn, InsightsReport, ProductDescriptionResult } from '../types'

/** AI assistant endpoints. */
export const assistantApi = {
  /** How many AI requests the user has left this hour (AI-8). */
  quota: () => apiClient.get<AiQuota>('/ai/quota'),
  /** Sends the conversation so far; returns the assistant's answer (AI-1, AI-2). */
  chat: (messages: ChatTurn[]) => apiClient.post<ChatReply>('/ai/chat', { messages }),
  /** A written report for the period, built from figures IMS computed (AI-4). */
  insights: (start_date: string, end_date: string) => apiClient.post<InsightsReport>('/ai/insights', { start_date, end_date }),
  /** A draft product description from its name and category (AI-5). */
  productDescription: (name: string, category: string) => apiClient.post<ProductDescriptionResult>('/ai/product-description', { name, category }),
}
