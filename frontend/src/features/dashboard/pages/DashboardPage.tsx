import { useState } from 'react'

import { DateRangePicker } from '@/components/common/DateRangePicker'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { type DateRange, presetRange, RANGE_PRESETS, type RangePresetId } from '@/lib/dates'
import { formatLongDate } from '@/lib/format'

import { CategoryRevenueCard } from '../components/CategoryRevenueCard'
import { KpiGrid } from '../components/KpiGrid'
import { LowStockCard } from '../components/LowStockCard'
import { RevenueChart } from '../components/RevenueChart'
import { TopProductsCard } from '../components/TopProductsCard'
import type { Granularity } from '../types'
import { fitGranularity } from '../utils/granularity'

export function DashboardPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange('30D'))
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const activePreset = RANGE_PRESETS.find((p) => {
    const r = p.range(new Date())
    return r.start === range.start && r.end === range.end
  })?.id

  // DSH-6: one date range drives every time-based widget.
  const changeRange = (next: DateRange) => {
    setRange(next)
    setGranularity((g) => fitGranularity(g, next))
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-4 md:px-8">
        <div>
          <h1 className="text-page-title">Dashboard</h1>
          <p className="text-[13px] text-muted-foreground">{formatLongDate(new Date())} · figures computed from recorded sales and stock</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<RangePresetId | 'custom'>
            label="Quick ranges"
            className="hidden md:inline-flex"
            value={activePreset ?? 'custom'}
            onChange={(id) => id !== 'custom' && changeRange(presetRange(id))}
            options={RANGE_PRESETS.map((p) => ({ value: p.id, label: p.id }))}
          />
          <DateRangePicker value={range} onChange={changeRange} />
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 md:px-8 md:pt-6 md:pb-12">
        <KpiGrid />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <RevenueChart range={range} granularity={granularity} onGranularityChange={setGranularity} />
          <CategoryRevenueCard range={range} />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <TopProductsCard range={range} />
          <LowStockCard />
        </div>
      </div>
    </div>
  )
}
