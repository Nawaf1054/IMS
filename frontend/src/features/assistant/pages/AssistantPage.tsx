/** /assistant: AI chat and insights (PRD §6.8). Until the AI milestone (M8) ships, it shows a blurred "Coming soon" preview. */
import { SparklesIcon } from 'lucide-react'

import { ComingSoon } from '@/components/feedback/ComingSoon'
import { Page, PageHeader } from '@/components/layout/Page'
import { AI_ASSISTANT_ENABLED } from '@/config/constants'

import { ChatPanel } from '../components/ChatPanel'
import { InsightsPanel } from '../components/InsightsPanel'
import { QuotaMeter } from '../components/QuotaMeter'

/** The chat panel next to the insights panel. */
function AssistantPanels() {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <ChatPanel />
      <InsightsPanel />
    </div>
  )
}

/** Route screen for the assistant. */
export function AssistantPage() {
  return (
    <Page className="md:pb-8">
      <PageHeader
        title="Assistant"
        description="Answers come from IMS data through read-only tools. It can’t change records, and all figures are calculated by IMS."
        actions={AI_ASSISTANT_ENABLED ? <QuotaMeter /> : undefined}
      />
      {AI_ASSISTANT_ENABLED ? (
        <AssistantPanels />
      ) : (
        <ComingSoon icon={SparklesIcon} description="Ask questions about your sales and stock in plain language, and get written insights for any period.">
          <AssistantPanels />
        </ComingSoon>
      )}
    </Page>
  )
}
