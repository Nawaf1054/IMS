/** "Generate insights" panel (AI-4): pick a period and get a short written report. */
import { SparklesIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Panel, PanelHeader } from '@/components/common/Panel'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { addDays, type DateRange, toISODate } from '@/lib/dates'
import { formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useAiQuota, useGenerateInsights } from '../api/queries'
import type { FigureTone } from '../types'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The periods offered for a report: this month, last month and the last 30 days. */
function periods(today = new Date()): Array<{ id: string; label: string; range: DateRange }> {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  return [
    { id: 'mtd', label: `This month · ${formatShortDate(monthStart)}–${today.getDate()}`, range: { start: toISODate(monthStart), end: toISODate(today) } },
    { id: 'last-month', label: `Last month · ${MONTHS[lastMonthStart.getMonth()]}`, range: { start: toISODate(lastMonthStart), end: toISODate(lastMonthEnd) } },
    { id: '30d', label: 'Last 30 days', range: { start: toISODate(addDays(today, -29)), end: toISODate(today) } },
  ]
}

const TONE: Record<FigureTone, string> = { positive: 'text-success', negative: 'text-danger', warning: 'text-warning' }

/** AI-4: IMS computes the figures, the model only writes the summary. */
export function InsightsPanel() {
  const options = periods()
  const [periodId, setPeriodId] = useState(options[0].id)
  const generate = useGenerateInsights()
  const { data: quota } = useAiQuota()
  const report = generate.data

  const run = () => {
    const { range } = options.find((o) => o.id === periodId) ?? options[0]
    generate.mutate(range, { onError: (e) => toast.error('Couldn’t generate the report', { description: e.message }) })
  }

  const copy = async () => {
    if (!report) return
    const text = report.sections.map((s) => `${s.heading}\n${s.body}`).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Report copied', { description: 'Paste it into an email or note' })
    } catch {
      toast.error('Couldn’t copy', { description: 'Your browser blocked clipboard access.' })
    }
  }

  return (
    <Panel aria-labelledby="insights-heading" className="flex flex-col gap-4 p-5">
      <PanelHeader id="insights-heading" title="Insights report" description="IMS computes the figures; the AI only writes the summary." />
      <div className="flex gap-2">
        <NativeSelect aria-label="Period" className="flex-1" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          {options.map((o) => (
            <NativeSelectOption key={o.id} value={o.id}>
              {o.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button onClick={run} disabled={generate.isPending || quota?.remaining === 0}>
          <SparklesIcon />
          {generate.isPending ? 'Writing…' : 'Generate'}
        </Button>
      </div>

      {report && !generate.isPending && (
        <div className="grid grid-cols-2 gap-2">
          {report.figures.map((figure) => (
            <div key={figure.label} className="flex min-w-0 flex-col gap-0.5 rounded-lg border bg-subtle px-3 py-2.5">
              <span className="text-[11px] text-muted-foreground">{figure.label}</span>
              <span className={cn('truncate text-[15px] font-semibold', figure.tone && TONE[figure.tone])}>{figure.value}</span>
            </div>
          ))}
        </div>
      )}

      {generate.isPending ? (
        <div className="flex flex-col gap-2.5" aria-label="Writing report">
          {['92%', '84%', '88%', '60%'].map((w) => (
            <Skeleton key={w} className="h-2.5" style={{ width: w }} />
          ))}
        </div>
      ) : report ? (
        <>
          <article className="flex flex-col gap-3 leading-[22px] text-subtle-foreground">
            {report.sections.map((section) => (
              <div key={section.heading} className="flex flex-col gap-0.5">
                <strong className="text-[13px] font-semibold text-foreground">{section.heading}</strong>
                <p>{section.body}</p>
              </div>
            ))}
          </article>
          <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <span>Generated {new Date(report.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · uses 1 request</span>
            <Button variant="outline" size="xs" onClick={copy}>
              Copy text
            </Button>
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-muted-foreground">
          Choose a period and generate a short written report on sales, categories and stock.
        </p>
      )}
    </Panel>
  )
}
