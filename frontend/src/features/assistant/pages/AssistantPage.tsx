import { Page, PageHeader } from '@/components/layout/Page'

import { ChatPanel } from '../components/ChatPanel'
import { InsightsPanel } from '../components/InsightsPanel'
import { QuotaMeter } from '../components/QuotaMeter'

export function AssistantPage() {
  return (
    <Page className="md:pb-8">
      <PageHeader
        title="Assistant"
        description="Answers come from IMS data through read-only tools. It can’t change records, and all figures are calculated by IMS."
        actions={<QuotaMeter />}
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ChatPanel />
        <InsightsPanel />
      </div>
    </Page>
  )
}
