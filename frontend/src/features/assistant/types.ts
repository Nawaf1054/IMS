import type { AiQuota } from '@/types/models'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Which read-only backend tool produced the data behind an answer (AI-2). */
export interface ChatSource {
  tool: string
  label: string
}

export interface AssistantMessage {
  role: 'assistant'
  content: string
  rows: Array<{ label: string; value: string }>
  sources: ChatSource[]
}

/** POST /ai/chat */
export interface ChatReply {
  message: AssistantMessage
  quota: AiQuota
}

export type FigureTone = 'positive' | 'negative' | 'warning'

/** POST /ai/insights: figures are computed by IMS; the LLM only writes the sections (AI-4). */
export interface InsightsReport {
  start_date: string
  end_date: string
  figures: Array<{ label: string; value: string; tone: FigureTone | null }>
  sections: Array<{ heading: string; body: string }>
  generated_at: string
  quota: AiQuota
}

/** POST /ai/product-description (AI-5) */
export interface ProductDescriptionResult {
  description: string
  quota: AiQuota
}
