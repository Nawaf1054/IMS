/**
 * Stand-in for the LLM endpoints. Like the real assistant it only reads data
 * through predefined "tools" (AI-2, AI-3) and every figure comes from IMS data;
 * the wording is templated instead of generated. Include "simulate outage" in a
 * question to exercise the AI-7 failure state.
 */
import { http } from 'msw'

import { addDays, toISODate } from '@/lib/dates'
import { formatChange, formatDate, formatMoney, formatNumber, formatShortDate } from '@/lib/format'
import { fromCents } from '@/lib/money'
import type { ChatReply, ChatSource, ChatTurn, InsightsReport, ProductDescriptionResult } from '@/features/assistant/types'
import type { AiQuota } from '@/types/models'

import type { UserRow } from '../data/seed'
import { db, lowStockProducts, productSales, rootCategoryId, salesTotals } from '../db'
import { API, fail, readBody, requireUser, route } from '../http'

const LIMIT = 20
const WINDOW_MS = 3_600_000
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

// ── Rate limit (AI-8) ───────────────────────────────────────────────────────

function quota(user: UserRow): AiQuota {
  const now = Date.now()
  const recent = (db.aiUsage.get(user.id) ?? []).filter((t) => now - t < WINDOW_MS)
  db.aiUsage.set(user.id, recent)
  return { limit: LIMIT, remaining: Math.max(0, LIMIT - recent.length), resets_at: new Date((recent[0] ?? now) + WINDOW_MS).toISOString() }
}

function consume(user: UserRow): AiQuota {
  if (quota(user).remaining === 0) fail(429, 'RATE_LIMITED', `You’ve used all ${LIMIT} AI requests this hour.`)
  db.aiUsage.get(user.id)!.push(Date.now())
  return quota(user)
}

// ── Read-only tools ─────────────────────────────────────────────────────────

interface Range {
  start: string
  end: string
  label: string
}

const money = (cents: number) => formatMoney(fromCents(cents), db.settings.currency)
const rangeText = (r: Range) => (r.start === r.end ? formatShortDate(r.start) : `${formatShortDate(r.start)} – ${formatShortDate(r.end)}`)

function parseRange(text: string): Range {
  const now = new Date()
  const today = toISODate(now)
  if (/\btoday\b/.test(text)) return { start: today, end: today, label: 'today' }
  if (/\byesterday\b/.test(text)) {
    const y = toISODate(addDays(now, -1))
    return { start: y, end: y, label: 'yesterday' }
  }
  if (/last week|past week|this week/.test(text)) return { start: toISODate(addDays(now, -6)), end: today, label: 'the last 7 days' }
  if (/last 30 days|past month/.test(text)) return { start: toISODate(addDays(now, -29)), end: today, label: 'the last 30 days' }
  if (/last month/.test(text)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return {
      start: toISODate(start),
      end: toISODate(new Date(now.getFullYear(), now.getMonth(), 0)),
      label: MONTHS[start.getMonth()].replace(/^./, (c) => c.toUpperCase()),
    }
  }
  const month = MONTHS.findIndex((m) => text.includes(m))
  if (month >= 0) {
    const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear()
    const end = month === now.getMonth() ? now : new Date(year, month + 1, 0)
    return { start: toISODate(new Date(year, month, 1)), end: toISODate(end), label: MONTHS[month].replace(/^./, (c) => c.toUpperCase()) }
  }
  return { start: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), end: today, label: 'this month' }
}

function topProducts(range: Range, order: 'asc' | 'desc', by: 'quantity' | 'revenue', limit: number, categoryRoot?: number) {
  return [...productSales(range.start, range.end)]
    .map(([id, s]) => ({ product: db.products.find((p) => p.id === id)!, ...s }))
    .filter((r) => r.product && r.product.is_active && (!categoryRoot || rootCategoryId(r.product.category_id) === categoryRoot))
    .sort((a, b) => (order === 'desc' ? b[by] - a[by] : a[by] - b[by]))
    .slice(0, limit)
}

function categoryRevenue(range: Range) {
  const totals = new Map<number, number>()
  for (const [id, s] of productSales(range.start, range.end)) {
    const product = db.products.find((p) => p.id === id)
    if (!product) continue
    const root = rootCategoryId(product.category_id)
    totals.set(root, (totals.get(root) ?? 0) + s.revenue)
  }
  return [...totals].sort((a, b) => b[1] - a[1]).map(([id, revenue]) => ({ name: db.categories.find((c) => c.id === id)?.name ?? '', revenue }))
}

function answer(question: string): ChatReply['message'] {
  const text = question.toLowerCase()
  const range = parseRange(text)
  const sources: ChatSource[] = []
  const mentioned = db.products.find((p) =>
    p.name
      .toLowerCase()
      .split(/[\s(]/)
      .filter((w) => w.length > 4)
      .some((w) => text.includes(w)),
  )

  if (mentioned && /run out|running out|last|enough|stock/.test(text)) {
    const month: Range = { start: toISODate(addDays(new Date(), -29)), end: toISODate(new Date()), label: 'the last 30 days' }
    const sold = productSales(month.start, month.end).get(mentioned.id)?.quantity ?? 0
    const perWeek = (sold / 30) * 7
    const weeks = perWeek ? mentioned.quantity / perWeek : Infinity
    const outlook =
      mentioned.quantity === 0
        ? 'It’s already out of stock.'
        : weeks < 1
          ? 'Likely within the next week.'
          : weeks < 3
            ? `Probably in about ${Math.round(weeks)} weeks.`
            : 'Not soon at the current pace.'
    sources.push(
      { tool: 'get_low_stock_products', label: 'Low-stock products · now' },
      { tool: 'get_top_products', label: `Top products · ${rangeText(month)}` },
    )
    return {
      role: 'assistant',
      content: `${outlook} ${mentioned.name} has ${mentioned.quantity} units on hand against a minimum of ${mentioned.min_quantity}, and it sold ${sold} units over the last 30 days, about ${perWeek.toFixed(1)} a week.${mentioned.quantity <= mentioned.min_quantity ? ' Recording a delivery soon would keep it in stock.' : ''}`,
      rows: [],
      sources,
    }
  }

  if (/least|fewest|slow|worst/.test(text)) {
    const rows = topProducts(range, 'asc', 'quantity', 3)
    sources.push({ tool: 'get_top_products', label: `Top products · ${rangeText(range)}, lowest 3` })
    return {
      role: 'assistant',
      content: rows.length
        ? `These sold the fewest units in ${range.label} (active products with at least one sale):`
        : `No sales were recorded in ${range.label}.`,
      rows: rows.map((r) => ({ label: r.product.name, value: `${formatNumber(r.quantity)} units · ${money(r.revenue)}` })),
      sources,
    }
  }

  if (/low|running out|run out|restock|out of stock|reorder/.test(text)) {
    const low = lowStockProducts()
    const out = low.filter((p) => p.quantity === 0)
    sources.push({ tool: 'get_low_stock_products', label: 'Low-stock products · now' })
    return {
      role: 'assistant',
      content: low.length
        ? `${low.length} products are at or below their minimum.${out.length ? ` ${out.map((p) => p.name).join(', ')} ${out.length === 1 ? 'is' : 'are'} out of stock entirely.` : ''}`
        : 'Nothing is at or below its minimum right now.',
      rows: low.map((p) => ({ label: p.name, value: `${p.quantity} / min ${p.min_quantity}` })),
      sources,
    }
  }

  if (/categor/.test(text)) {
    const rows = categoryRevenue(range)
    sources.push({ tool: 'get_category_revenue', label: `Category revenue · ${rangeText(range)}` })
    return {
      role: 'assistant',
      content: `Revenue by category for ${range.label} (${rangeText(range)}):`,
      rows: rows.map((r) => ({ label: r.name, value: money(r.revenue) })),
      sources,
    }
  }

  if (/best|top|most|popular/.test(text)) {
    const category = db.categories.find((c) => c.parent_id === null && text.includes(c.name.toLowerCase().replace(/s$/, '')))
    const rows = topProducts(range, 'desc', 'revenue', 3, category?.id)
    sources.push({ tool: 'get_top_products', label: `Top products · ${rangeText(range)}${category ? `, ${category.name}` : ''}` })
    return {
      role: 'assistant',
      content: `In ${range.label} the best-selling ${category ? category.name.toLowerCase() : 'products'} by revenue were:`,
      rows: rows.map((r) => ({ label: r.product.name, value: `${formatNumber(r.quantity)} units · ${money(r.revenue)}` })),
      sources,
    }
  }

  const totals = salesTotals(range.start, range.end)
  sources.push({ tool: 'get_sales_summary', label: `Sales summary · ${rangeText(range)}` })
  return {
    role: 'assistant',
    content: `Here’s the overall picture for ${range.label}: ${money(totals.revenue)} in sales across ${formatNumber(totals.count)} invoices. I can break this down by product, category or day if you tell me what you’re after.`,
    rows: [],
    sources,
  }
}

// ── Descriptions (AI-5) ─────────────────────────────────────────────────────

const DESCRIPTION_TEMPLATES: Record<string, string> = {
  'Building Materials':
    '{name} for structural and finishing work on residential and commercial sites. Consistent quality batch to batch; store dry and off the ground.',
  Plumbing: '{name} for water supply and drainage installations. Fits standard fittings; check pressure ratings against your system before installing.',
  Electrical: '{name} for domestic and light commercial wiring. Install to local wiring regulations; always isolate the supply before working.',
  'Power Tools': '{name} for drilling, cutting and fastening on site or in the workshop. Pairs well with the matching accessories and spare batteries.',
  'Hand Tools': '{name} for everyday fixing and assembly jobs. Durable construction for trade use, sized for a standard toolbox.',
  Paint: '{name} for interior and exterior surfaces. Even coverage with low odour; prepare and prime surfaces for the best finish.',
  Safety: '{name} for site protection. Meets common workplace safety requirements; inspect before each use and replace when damaged.',
}

export const aiHandlers = [
  http.get(
    `${API}/ai/quota`,
    route(({ request }) => quota(requireUser(request))),
  ),

  http.post(
    `${API}/ai/chat`,
    route(async ({ request }): Promise<ChatReply> => {
      const user = requireUser(request)
      const { messages = [] } = await readBody<{ messages?: ChatTurn[] }>(request)
      const question = messages
        .filter((m) => m.role === 'user')
        .at(-1)
        ?.content.trim()
      if (!question) fail(422, 'VALIDATION_ERROR', 'Ask a question first.')
      if (/simulate outage/i.test(question)) fail(503, 'AI_UNAVAILABLE', 'The AI service isn’t responding.')
      const q = consume(user)
      return { message: answer(question), quota: q }
    }),
  ),

  http.post(
    `${API}/ai/insights`,
    route(async ({ request }): Promise<InsightsReport> => {
      const user = requireUser(request)
      const { start_date, end_date } = await readBody<{ start_date?: string; end_date?: string }>(request)
      if (!start_date || !end_date) fail(422, 'VALIDATION_ERROR', 'Choose a period.')
      const q = consume(user)

      const length = Math.round((new Date(end_date).getTime() - new Date(start_date).getTime()) / 86_400_000) + 1
      const prev = { start: toISODate(addDays(new Date(start_date), -length)), end: toISODate(addDays(new Date(start_date), -1)) }
      const current = salesTotals(start_date, end_date)
      const previous = salesTotals(prev.start, prev.end)
      const change = formatChange(current.revenue, previous.revenue)
      const categories = categoryRevenue({ start: start_date, end: end_date, label: '' })
      const categoryTotal = categories.reduce((sum, c) => sum + c.revenue, 0) || 1
      const low = lowStockProducts()
      const top = topProducts({ start: start_date, end: end_date, label: '' }, 'desc', 'quantity', 1)[0]
      const share = (c?: { revenue: number }) => (c ? `${Math.round((c.revenue / categoryTotal) * 100)}%` : '—')
      const up = current.revenue >= previous.revenue

      return {
        start_date,
        end_date,
        figures: [
          { label: 'Revenue', value: money(current.revenue), tone: null },
          {
            label: `vs ${formatShortDate(prev.start)} – ${formatShortDate(prev.end)}`,
            value: change ?? '—',
            tone: change ? (up ? 'positive' : 'negative') : null,
          },
          { label: 'Invoices', value: formatNumber(current.count), tone: null },
          { label: 'Avg invoice', value: money(current.count ? Math.round(current.revenue / current.count) : 0), tone: null },
          { label: 'Top category', value: categories[0] ? `${categories[0].name} ${share(categories[0])}` : '—', tone: null },
          { label: 'Low stock', value: `${low.length} products`, tone: low.length ? 'warning' : null },
        ],
        sections: [
          {
            heading: up ? 'Sales are ahead of the previous period' : 'Sales are behind the previous period',
            body: `From ${formatDate(start_date)} to ${formatDate(end_date)} IMS recorded ${money(current.revenue)} over ${formatNumber(current.count)} invoices, ${change ? `${change} compared with` : 'with no sales in'} the ${length} days before.`,
          },
          {
            heading: categories[0] ? `${categories[0].name} carries the period` : 'No category data yet',
            body: categories[0]
              ? `${categories[0].name} made up ${share(categories[0])} of revenue${top ? `, and ${top.product.name} sold the most units (${formatNumber(top.quantity)})` : ''}.${categories[1] ? ` ${categories[1].name} and ${categories[2]?.name ?? 'the rest'} follow at ${share(categories[1])} and ${share(categories[2])}.` : ''}`
              : 'No completed sales in this period.',
          },
          {
            heading: low.length ? 'Restock before it costs sales' : 'Stock levels look healthy',
            body: low.length
              ? `${low.length} products are at or below minimum. ${low
                  .slice(0, 2)
                  .map((p) => `${p.name} (${p.quantity} on hand, minimum ${p.min_quantity})`)
                  .join(' and ')} should be ordered first.`
              : 'Every active product is above its minimum quantity.',
          },
        ],
        generated_at: new Date().toISOString(),
        quota: q,
      }
    }),
  ),

  http.post(
    `${API}/ai/product-description`,
    route(async ({ request }): Promise<ProductDescriptionResult> => {
      const user = requireUser(request)
      const { name = '', category = '' } = await readBody<{ name?: string; category?: string }>(request)
      if (!name.trim()) fail(422, 'VALIDATION_ERROR', 'Enter a product name first.')
      const q = consume(user)
      const leaf = category.split('›').at(-1)?.trim() ?? ''
      const template =
        DESCRIPTION_TEMPLATES[leaf] ?? DESCRIPTION_TEMPLATES[category.split('›')[0]?.trim() ?? ''] ?? '{name}, stocked for trade and retail customers.'
      return { description: template.replace('{name}', name.trim()), quota: q }
    }),
  ),
]
