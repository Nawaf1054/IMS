/** Request and response types for the AI assistant endpoints (/ai). */
import type { AiQuota } from '@/types/models'

/** One message of the conversation sent to POST /ai/chat. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Which read-only backend tool produced the data behind an answer (AI-2). */
export interface ChatSource {
  tool: string
  label: string
}

/** The assistant's answer: text, optional figure rows and the tools it used. */
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

/** Colour hint for a figure in the insights report. */
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

/** Input limits POST /ai/chat enforces: the history sent is at most this many turns… */
export const MAX_CHAT_TURNS = 20
/** …and each message is at most this many characters. */
export const MAX_MESSAGE_LENGTH = 2000
